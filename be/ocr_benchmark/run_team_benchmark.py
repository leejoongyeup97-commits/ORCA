from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path
import cv2

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from orca_ocr.engine import extract_team

FIELDS=["elims","assists","deaths","damage","healing","mitigation"]

def main():
    p=argparse.ArgumentParser(description="ORCA Team OCR benchmark")
    p.add_argument("image_dir",type=Path)
    p.add_argument("--truth",type=Path,default=Path(__file__).with_name("team_ground_truth.json"))
    args=p.parse_args()
    truth_doc=json.loads(args.truth.read_text(encoding="utf-8"))
    truth=truth_doc["images"]
    me_truth=truth_doc.get("me_slots",{})
    total=correct=0
    me_total=me_correct=0
    by_field={k:[0,0] for k in FIELDS}
    failures=[]
    started=time.perf_counter()
    for name, expected_rows in truth.items():
        path=args.image_dir/name
        img=cv2.imread(str(path))
        if img is None:
            failures.append({"image":name,"error":"missing image"}); continue
        t=time.perf_counter(); result=extract_team(img); elapsed=time.perf_counter()-t
        rows=result.get("players",[])
        image_correct=0
        for ri, exp in enumerate(expected_rows):
            got=rows[ri] if ri<len(rows) else {}
            for fi,field in enumerate(FIELDS):
                expected=exp[fi]; actual=got.get(field)
                total+=1; by_field[field][1]+=1
                if actual==expected:
                    correct+=1; image_correct+=1; by_field[field][0]+=1
                else:
                    failures.append({"image":name,"row":ri+1,"field":field,"expected":expected,"actual":actual})
        if name in me_truth:
            me_total+=1
            actual_me=next((r.get("slot") for r in rows if r.get("team")=="blue" and r.get("is_me") is True),None)
            if actual_me==me_truth[name]:
                me_correct+=1
            else:
                failures.append({"image":name,"field":"is_me","expected":me_truth[name],"actual":actual_me})
        print(f"{name}: {image_correct}/60 ({image_correct/60:.1%}) | {elapsed:.1f}s")
    print("\n=== ORCA TEAM OCR BENCHMARK ===")
    print(f"overall: {correct}/{total} ({correct/total:.1%})" if total else "overall: no scored cells")
    for f,(c,n) in by_field.items():
        print(f"{f:10}: {c}/{n} ({c/n:.1%})" if n else f"{f:10}: no data")
    if me_total:
        print(f"is_me      : {me_correct}/{me_total} ({me_correct/me_total:.1%})")
    print(f"elapsed: {time.perf_counter()-started:.1f}s")
    out=Path(__file__).with_name("last_failures.json")
    out.write_text(json.dumps(failures,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"failures: {out}")

if __name__=="__main__":
    main()
