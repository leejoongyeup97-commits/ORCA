from pathlib import Path
import json, cv2
from orca_ocr.engine import extract
root=Path(__file__).resolve().parents[1]
for t,fn in [("summary","summary.jpg"),("team","team.jpg"),("personal","personal.jpg"),("replay","replay.png")]:
    img=cv2.imread(str(root/"public"/"references"/fn))
    print("\n===",t,"===")
    print(json.dumps(extract(img,t),ensure_ascii=False,indent=2))
