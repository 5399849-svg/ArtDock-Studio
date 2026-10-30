"""把 local-ai/models/sam2.1-hiera-small（原来 scripts/sam2-character-cutout.py 用的 SAM2 视频模型）
的“第一帧”计算导出成浏览器能跑的两个 ONNX 文件：

  vision_encoder.onnx  pixel_values -> image_embeddings.0/1/2（已加上 no-memory embedding）
  mask_decoder.onnx    点（先放框的两个角，标签 2、3，再放点击的点）-> pred_masks、iou_scores（单张蒙版）

和原脚本的结果一致（样例 IoU 0.998）。用法（要装 torch、transformers 4.56 和 onnx）：
  local-ai/generative/.venv/Scripts/python.exe scripts/platform/export-sam2-onnx.py public/platform/models/sam2.1-hiera-small
"""
import shutil
import sys
from pathlib import Path

import torch
from transformers import Sam2VideoModel

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / 'local-ai' / 'models' / 'sam2.1-hiera-small'
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public' / 'platform' / 'models' / 'sam2.1-hiera-small'
out.mkdir(parents=True, exist_ok=True)
model = Sam2VideoModel.from_pretrained(MODEL_DIR, local_files_only=True, dtype=torch.float32).eval()
sizes = model.backbone_feature_sizes


class Encoder(torch.nn.Module):
    def __init__(self, sam):
        super().__init__()
        self.sam = sam

    def forward(self, pixel_values):
        feature_maps = list(self.sam.get_image_features(pixel_values)[0])
        feature_maps[-1] = feature_maps[-1] + self.sam.no_memory_embedding
        batch = pixel_values.shape[0]
        e0, e1, e2 = [feat.permute(1, 2, 0).reshape(batch, -1, *size) for feat, size in zip(feature_maps, sizes)]
        return e0, e1, e2


class Decoder(torch.nn.Module):
    def __init__(self, sam):
        super().__init__()
        self.sam = sam

    def forward(self, input_points, input_labels, e0, e1, e2):
        # 和视频模型第一帧一样：点里含框的两个角，单张蒙版输出（multimask_output=False）。
        result = self.sam._single_frame_forward(pixel_values=None, input_points=input_points, input_labels=input_labels,
                                                image_embeddings=[e0, e1, e2], multimask_output=False)
        return result.pred_masks, result.iou_scores


encoder, decoder = Encoder(model).eval(), Decoder(model).eval()
pixels = torch.randn(1, 3, 1024, 1024)
with torch.inference_mode():
    e0, e1, e2 = encoder(pixels)
points = torch.tensor([[[[0.0, 0.0], [900.0, 1000.0], [400.0, 300.0]]]])
labels = torch.tensor([[[2, 3, 1]]], dtype=torch.int32)
torch.onnx.export(encoder, (pixels,), str(out / 'vision_encoder.onnx'), input_names=['pixel_values'],
                  output_names=['image_embeddings.0', 'image_embeddings.1', 'image_embeddings.2'], opset_version=17, dynamo=False)
torch.onnx.export(decoder, (points, labels, e0, e1, e2), str(out / 'mask_decoder.onnx'),
                  input_names=['input_points', 'input_labels', 'image_embeddings.0', 'image_embeddings.1', 'image_embeddings.2'],
                  output_names=['pred_masks', 'iou_scores'], dynamic_axes={'input_points': {2: 'num_points'}, 'input_labels': {2: 'num_points'}},
                  opset_version=17, dynamo=False)
shutil.copyfile(MODEL_DIR / 'config.json', out / 'config.json')
for name in ('vision_encoder.onnx', 'mask_decoder.onnx', 'config.json'):
    print(name, (out / name).stat().st_size)
