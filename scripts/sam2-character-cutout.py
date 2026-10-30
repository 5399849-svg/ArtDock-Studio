from __future__ import annotations

import argparse
import gc
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageFilter, ImageDraw
from transformers import Sam2Model, Sam2Processor, Sam2VideoModel, Sam2VideoProcessor


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "local-ai" / "models" / "sam2.1-hiera-small"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a pixel-preserving union cutout from SAM2 prompts.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--prompts", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--separate-output", type=Path)
    parser.add_argument("--max-side", type=int, default=1600)
    parser.add_argument("--device", choices=['auto', 'cpu', 'cuda'], default='auto')
    args = parser.parse_args()

    source_image = Image.open(args.input).convert("RGB")
    ratio = min(1.0, max(512, args.max_side) / max(source_image.size))
    image = source_image.resize((round(source_image.width * ratio), round(source_image.height * ratio)), Image.Resampling.LANCZOS) if ratio < 1 else source_image
    objects = json.loads(args.prompts.read_text(encoding="utf-8-sig"))["objects"]
    objects = [{**item, "points": [item["points"]] if item["points"] and isinstance(item["points"][0], (int, float)) else item["points"]} for item in objects]
    if ratio < 1:
        objects = [{**item, "box":[round(value * ratio) for value in item["box"]], "points":[[round(value * ratio) for value in point] for point in item["points"]]} for item in objects]
        for item in objects:
            if 'bodyPoints' in item:item['bodyPoints']=[[round(v*ratio) for v in p] for p in item['bodyPoints']]
            item['accessoryPaths']=[{**p,'from':[v*ratio for v in p['from']],'to':[v*ratio for v in p['to']],'radius':p['radius']*ratio} for p in item.get('accessoryPaths',[])]
    # Leave the desktop/Photoshop's memory alone. A busy GPU should not turn a
    # recoverable local extraction into a failed task.
    device = args.device if args.device != 'auto' else ("cuda" if torch.cuda.is_available() and torch.cuda.mem_get_info()[0]>=4*1024**3 else "cpu")
    torch.set_num_threads(1)
    config = json.loads((MODEL_DIR / 'config.json').read_text(encoding='utf-8'))
    video_checkpoint = config.get('model_type') == 'sam2_video' or 'Sam2VideoModel' in config.get('architectures', [])
    dtype = torch.float32
    if video_checkpoint:
        # The locally installed checkpoint includes the video model's memory
        # embeddings. Loading it as Sam2Model silently changes its mask behavior.
        processor = Sam2VideoProcessor.from_pretrained(MODEL_DIR, local_files_only=True)
        model = Sam2VideoModel.from_pretrained(MODEL_DIR, local_files_only=True, use_safetensors=True, dtype=dtype).to(device).eval()
        inputs = processor(images=image, device=device, return_tensors='pt').to(device)
        independent_masks=[]
        # The installed video processor cannot broadcast box labels for multiple
        # objects. Separate sessions also prevent one character stealing another's
        # pixels, while loading the expensive model only once.
        def predict(item, points, labels):
            session = processor.init_video_session(inference_device=device, dtype=dtype)
            processor.add_inputs_to_inference_session(
                inference_session=session, frame_idx=0, obj_ids=[1],
                input_boxes=[[item['box']]],
                input_points=[[points]] if points else None,
                input_labels=[[labels]] if points else None,
                original_size=inputs.original_sizes[0],
            )
            with torch.inference_mode():
                outputs = model(inference_session=session, frame=inputs.pixel_values[0])
            result=processor.post_process_masks([outputs.pred_masks], inputs.original_sizes, binarize=True)[0].detach().cpu()[0]
            del outputs,session
            gc.collect()
            if device=='cuda':torch.cuda.empty_cache()
            return result
        def predict_with_fallback(item, points, labels):
            nonlocal device, model, inputs
            try:
                return predict(item, points, labels)
            except RuntimeError as error:
                if device != 'cuda' or not any(s in str(error).lower() for s in ('out of memory', 'memory allocation', 'unable to find an engine')):
                    raise
            # Other desktop apps can allocate VRAM after our initial check.
            # Retry locally on CPU without reloading the checkpoint or changing
            # the selection, instead of failing the user's whole extraction.
            device = 'cpu'
            model = model.to(device)
            inputs = inputs.to(device)
            gc.collect()
            torch.cuda.empty_cache()
            return predict(item, points, labels)
        for item in objects:
            complete=predict_with_fallback(item,item['points'],item['labels'])
            if item.get('accessoryPaths'):
                body=predict_with_fallback(item,item['bodyPoints'],item['bodyLabels'])
                corridor=Image.new('L',image.size);draw=ImageDraw.Draw(corridor)
                for p in item['accessoryPaths']:draw.line([tuple(p['from']),tuple(p['to'])],fill=255,width=max(1,round(p['radius']*2)))
                complete=torch.logical_or(body,torch.logical_and(complete,torch.from_numpy(np.asarray(corridor)>0)))
            independent_masks.append(complete)
        masks = torch.stack(independent_masks)
        scores = None
    else:
        processor = Sam2Processor.from_pretrained(MODEL_DIR, local_files_only=True)
        model = Sam2Model.from_pretrained(MODEL_DIR, local_files_only=True, use_safetensors=True, dtype=dtype).to(device).eval()
        point_inputs = {'input_points': [[item['points'] for item in objects]], 'input_labels': [[item['labels'] for item in objects]]} if any(item['points'] for item in objects) else {}
        inputs = processor(images=image, input_boxes=[[item['box'] for item in objects]], **point_inputs, return_tensors='pt')
        model_inputs = {key: value.to(device=device, dtype=dtype) if key == 'pixel_values' else value.to(device) for key, value in inputs.items() if isinstance(value, torch.Tensor) and key not in {'original_sizes', 'reshaped_input_sizes'}}
        with torch.inference_mode():
            outputs = model(**model_inputs, multimask_output=True)
        masks = processor.post_process_masks(outputs.pred_masks.detach().cpu(), inputs['original_sizes'], binarize=True)[0]
        scores = outputs.iou_scores.detach().float().cpu()[0]
    union = np.zeros((image.height, image.width), dtype=bool)
    selected = []
    for index, item in enumerate(objects):
        candidate = 0 if scores is None else int(torch.argmax(scores[index]).item())
        mask = masks[index, candidate].numpy().astype(bool)
        # Keep the complete mask here: trimming to just the face component would
        # discard a separately segmented utensil or thin hair lock. Refinement
        # removes unrelated islands while respecting all positive/negative points.
        union |= mask
        if args.separate_output:
            args.separate_output.mkdir(parents=True,exist_ok=True)
            alpha=Image.fromarray(mask.astype(np.uint8)*255,'L')
            if ratio<1: alpha=alpha.resize(source_image.size,Image.Resampling.LANCZOS)
            individual=source_image.convert('RGBA');individual.putalpha(alpha.filter(ImageFilter.GaussianBlur(.65)))
            individual.save(args.separate_output/f'{index}.png',optimize=True)
        selected.append({"name": item.get("name", str(index + 1)), "candidate": candidate, "score": None if scores is None else float(scores[index, candidate]), "pixels": int(mask.sum())})
    rgba = source_image.convert("RGBA")
    alpha = Image.fromarray(union.astype(np.uint8) * 255, "L")
    if ratio < 1:
        alpha = alpha.resize(source_image.size, Image.Resampling.LANCZOS)
    alpha = alpha.filter(ImageFilter.GaussianBlur(.65))
    rgba.putalpha(alpha)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(args.output, optimize=True)
    ys, xs = np.where(union)
    bounds = None if not len(xs) else {"x": int(xs.min() / ratio), "y": int(ys.min() / ratio), "width": int((xs.max() - xs.min() + 1) / ratio), "height": int((ys.max() - ys.min() + 1) / ratio)}
    print(json.dumps({"device": device, "modelClass": model.__class__.__name__, "bounds": bounds, "selected": selected}, ensure_ascii=False))


if __name__ == "__main__":
    main()
