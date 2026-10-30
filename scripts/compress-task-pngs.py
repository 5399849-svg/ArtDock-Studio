import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


def main() -> None:
    task_id = sys.argv[1]
    root = Path.cwd()
    tasks_path = root / "data" / "runtime" / "tasks.json"
    tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
    task = next(item for item in tasks if item["id"] == task_id)
    templates = {
        item["id"]: item
        for item in json.loads((root / "config" / "templates.json").read_text(encoding="utf-8"))
    }
    artifact_dir = root / "data" / "runtime" / "storage" / task_id / "artifacts"
    backup_dir = root / "data" / "runtime" / "storage" / task_id / "originals"
    backup_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for artifact in task.get("artifacts", []):
        if artifact.get("format", "").upper() != "PNG" or artifact.get("qc", {}).get("passed"):
            continue
        source = artifact_dir / artifact["name"]
        template = templates[artifact["templateId"]]
        before = source.stat().st_size
        if before > template["maxBytes"]:
            backup = backup_dir / artifact["name"]
            if not backup.exists():
                shutil.copy2(source, backup)
            temporary = source.with_suffix(".compressed.png")
            with Image.open(source) as image:
                compressed = image.convert("RGB").quantize(
                    colors=256,
                    method=Image.Quantize.MEDIANCUT,
                    dither=Image.Dither.NONE,
                )
                compressed.save(temporary, optimize=True, compress_level=9)
            temporary.replace(source)
        after = source.stat().st_size
        artifact["bytes"] = after
        for check in artifact.get("qc", {}).get("checks", []):
            if check.get("key") == "size":
                check["actual"] = after
                check["passed"] = after <= template["maxBytes"]
        artifact["qc"]["passed"] = all(check.get("passed") for check in artifact["qc"].get("checks", []))
        results.append({"templateId": artifact["templateId"], "before": before, "after": after})
    passed = len(task.get("artifacts", [])) == len(task.get("targetTemplateIds", [])) and all(
        artifact.get("qc", {}).get("passed") for artifact in task.get("artifacts", [])
    )
    now = datetime.now(timezone.utc).isoformat()
    task["qc"] = {"passed": passed, "checkedAt": now}
    task["updatedAt"] = now
    if passed:
        task["status"] = "成套审核"
        task["visualReview"] = {"status": "pending", "note": "PNG自动压缩完成，等待设计师成套视觉审核"}
        task.setdefault("history", []).append({"at": now, "action": "PNG自动压缩并重新质检", "by": "本地执行器", "status": task["status"]})
    temporary_tasks = tasks_path.with_suffix(".json.tmp")
    temporary_tasks.write_text(json.dumps(tasks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_tasks.replace(tasks_path)
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
