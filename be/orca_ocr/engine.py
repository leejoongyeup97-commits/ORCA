from __future__ import annotations
import re, os, shutil
from pathlib import Path
from typing import Any
import cv2
import numpy as np
import pytesseract


def _configure_tesseract() -> str:
    candidates=[]
    p=shutil.which('tesseract')
    if p: candidates.append(p)
    for env in ('ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA'):
        root=os.environ.get(env)
        if root:
            candidates += [str(Path(root)/'Tesseract-OCR'/'tesseract.exe'), str(Path(root)/'Programs'/'Tesseract-OCR'/'tesseract.exe')]
    candidates += [r'C:\Program Files\Tesseract-OCR\tesseract.exe',r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe']
    for c in dict.fromkeys(candidates):
        if c and Path(c).is_file():
            pytesseract.pytesseract.tesseract_cmd=c; return c
    raise RuntimeError('Tesseract OCR executable was not found.')


def get_tesseract_status()->dict[str,Any]:
    exe=_configure_tesseract(); langs=set(pytesseract.get_languages(config=''))
    return {'executable':exe,'languages':sorted(langs),'has_eng':'eng' in langs,'has_kor':'kor' in langs}

TESSERACT_EXE=_configure_tesseract()
ROI={
 'summary_result':(0.675,0.565,0.940,0.735), 'team_board':(0.278,0.180,0.724,0.925),
 'personal_panel':(0.200,0.175,0.965,0.805), 'replay_events':(0.000,0.175,0.215,0.800),
 'replay_clock':(0.865,0.845,0.980,0.915),
}

def _crop(img,box):
    h,w=img.shape[:2]; x1,y1,x2,y2=box
    return img[int(y1*h):int(y2*h),int(x1*w):int(x2*w)]

def _prep(img,scale=2.0,invert=False):
    gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY) if len(img.shape)==3 else img
    gray=cv2.resize(gray,None,fx=scale,fy=scale,interpolation=cv2.INTER_CUBIC)
    typ=cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY
    return cv2.threshold(gray,0,255,typ+cv2.THRESH_OTSU)[1]

def _ocr(img,psm=6,lang='kor+eng',whitelist=None):
    cfg=f'--psm {psm}' + (f' -c tessedit_char_whitelist={whitelist}' if whitelist else '')
    return pytesseract.image_to_string(_prep(img),lang=lang,config=cfg).strip()

def _time_to_seconds(s):
    m=re.fullmatch(r'(\d{1,2}):(\d{2})(?::(\d{2}))?',s)
    if not m:return None
    a,b,c=m.groups(); return int(a)*60+int(b) if c is None else int(a)*3600+int(b)*60+int(c)

def _normalize_mmss(token:str)->str|None:
    s=re.sub(r'[^0-9:]','',token)
    if re.fullmatch(r'\d{1,2}:\d{2}',s): return s
    d=re.sub(r'\D','',s)
    # Replay OCR often drops ':' (e.g. 2125 -> 2:25, 743 -> 7:43, 321 -> 3:21)
    if len(d)==3 and int(d[-2:])<60: return f'{int(d[0])}:{d[-2:]}'
    if len(d)==4 and int(d[-2:])<60: return f'{int(d[:-2])}:{d[-2:]}'
    return None

def _ocr_box(img, box, psm=7, lang='kor+eng', whitelist=None):
    return _ocr(_crop(img, box), psm=psm, lang=lang, whitelist=whitelist)


def extract_summary(img):
    # Fixed fields on the right-side summary card. Keeping the full card OCR is useful
    # for debugging, but each field is read independently so labels cannot steal values.
    card = ROI['summary_result']
    text = _ocr(_crop(img, card), 6)
    boxes = {
        'result': (0.682, 0.565, 0.790, 0.635),
        'score': (0.688, 0.625, 0.815, 0.665),
        'date': (0.688, 0.655, 0.855, 0.690),
        'mode': (0.688, 0.685, 0.825, 0.720),
        'duration': (0.688, 0.715, 0.855, 0.755),
    }
    field_raw = {k: _ocr_box(img, b, 7) for k,b in boxes.items()}

    result_text = field_raw['result'] + '\n' + text
    result = 'win' if '승리' in result_text else 'loss' if '패배' in result_text else None

    duration = None
    # The fixed duration crop can overlap the date/time. Prefer the labelled value
    # from the full card, then fall back to the crop only when necessary.
    m = re.search(r'(?:게임\s*)?소요\s*시간\s*[:：]?\s*(\d{1,2}:\d{2})', text)
    if not m:
        m = re.search(r'(?:게임\s*)?시간\s*[:：]?\s*(\d{1,2}:\d{2})', text)
    if not m:
        m = re.search(r'(\d{1,2}:\d{2})', field_raw['duration'])
    if m: duration = _time_to_seconds(m.group(1))

    score = None
    score_source = field_raw['score'] + '\n' + text
    patterns = [r'(\d+)\s*(?:VS|V5|V[S5])\s*(\d+)', r'최종\s*점수\s*[:：]?\s*(\d)\s*[1Il|]?5\s*(\d)']
    for pat in patterns:
        m = re.search(pat, score_source, re.I)
        if m:
            score = [int(m.group(1)), int(m.group(2))]; break

    mode = None
    mode_source = field_raw['mode'] + '\n' + text
    m = re.search(r'(?:게임\s*)?모드\s*[:：]?\s*([^\n]+)', mode_source)
    if m: mode = m.group(1).strip(' ·ㆍ|')
    elif '혼합' in mode_source: mode = '혼합'

    played_at_raw = None
    date_source = field_raw['date'] + '\n' + text
    m = re.search(r'(\d{1,2}/\d{1,2}/\d{2,4}\s*[-–]\s*\d{1,2}:\d{2})', date_source)
    if m: played_at_raw = m.group(1)

    return {
        'screen_type':'summary','ocr_version':'0.9.9.1-dev','result':result,
        'duration_seconds':duration,'final_score':score,'mode':mode,
        'played_at_raw':played_at_raw,
        'confidence':{
            'duration':0.98 if duration is not None else 0.0,
            'final_score':0.82 if score else 0.0,
            'mode':0.92 if mode else 0.0,
            'result':0.95 if result else 0.0,
            'played_at_raw':0.95 if played_at_raw else 0.0,
        },
        'field_raw':field_raw,'raw_text':text
    }

def _read_number(cell):
    """Read one scoreboard number quickly and reject unstable guesses."""
    if cell is None or cell.size == 0:
        return None, 0.0

    gray=cv2.cvtColor(cell,cv2.COLOR_BGR2GRAY) if len(cell.shape)==3 else cell
    gray=cv2.resize(gray,None,fx=3.0,fy=3.0,interpolation=cv2.INTER_CUBIC)

    # Scoreboard digits are bright. Remove most dark UI/background pixels first.
    _,bright=cv2.threshold(gray,150,255,cv2.THRESH_BINARY)
    bright=cv2.morphologyEx(bright,cv2.MORPH_CLOSE,np.ones((2,2),np.uint8))

    reads=[]
    for image in (gray,bright):
        for psm in (7,13):
            data=pytesseract.image_to_data(
                image,lang='eng',
                config=f'--psm {psm} -c tessedit_char_whitelist=0123456789',
                output_type=pytesseract.Output.DICT,
            )
            for text,conf in zip(data.get('text',[]),data.get('conf',[])):
                digits=re.sub(r'\D','',text or '')
                try: score=float(conf)
                except (TypeError,ValueError): score=-1
                if digits and score>=20:
                    reads.append((int(digits),score))

    if not reads:
        return None,0.0

    # Agreement wins. OCR confidence only breaks ties.
    grouped={}
    for value,score in reads:
        grouped.setdefault(value,[]).append(score)
    best=max(grouped,key=lambda v:(len(grouped[v]),sum(grouped[v])/len(grouped[v])))
    support=len(grouped[best])
    mean_conf=sum(grouped[best])/support
    confidence=min(0.99,(0.55+0.12*support)+(max(0.0,mean_conf)/100)*0.2)
    return best,round(confidence,2)

def _runs(mask, min_len=2):
    runs=[]; st=None
    for i,v in enumerate(mask):
        if v and st is None: st=i
        if st is not None and (not v or i==len(mask)-1):
            en=i if not v else i+1
            if en-st>=min_len:runs.append((st,en))
            st=None
    return runs

def _find_row_centers(board):
    """Find scoreboard rows from bright text/bars instead of assuming fixed Y slots."""
    gray=cv2.cvtColor(board,cv2.COLOR_BGR2GRAY)
    # White scoreboard text produces strong horizontal energy. Restrict to stats half.
    x1=int(board.shape[1]*0.42); x2=int(board.shape[1]*0.99)
    roi=gray[:,x1:x2]
    bright=(roi>175).astype(np.uint8)
    score=bright.mean(axis=1)
    # smooth and locate compact text bands
    score=np.convolve(score,np.ones(7)/7,mode='same')
    thr=max(float(np.percentile(score,72))*0.72,0.018)
    rs=_runs(score>thr,3)
    centers=[]
    for a,b in rs:
        if 3 <= b-a <= max(35,int(board.shape[0]*0.07)):
            centers.append((a+b)/2)
    # merge nearby fragments belonging to one row
    merged=[]
    gap=max(8,int(board.shape[0]*0.035))
    for c in centers:
        if not merged or c-merged[-1]>gap: merged.append(c)
        else: merged[-1]=(merged[-1]+c)/2
    # Score candidates by expected ten-row spacing and use fixed geometry only as fallback.
    if len(merged)>=10:
        best=None
        for i in range(len(merged)-9):
            cand=merged[i:i+10]
            gaps=np.diff(cand)
            cv=float(np.std(gaps)/(np.mean(gaps)+1e-6))
            span=cand[-1]-cand[0]
            val=cv + (0 if span>board.shape[0]*0.55 else 1)
            if best is None or val<best[0]: best=(val,cand)
        if best and best[0]<0.55:return best[1], 'detected'
    return [v*board.shape[0] for v in [0.090,0.180,0.270,0.360,0.450,0.525,0.615,0.705,0.795,0.885]], 'fallback'

def _find_stat_columns(board):
    """Detect six numeric columns near the known stats region, retaining safe fallback."""
    # Column positions vary far less than rows. Use normalized anchors, then local search
    # for bright text center so small scaling/crop changes do not cut digits.
    gray=cv2.cvtColor(board,cv2.COLOR_BGR2GRAY)
    anchors={'elims':0.475,'assists':0.545,'deaths':0.615,'damage':0.710,'healing':0.825,'mitigation':0.945}
    out={}
    col_energy=(gray>175).mean(axis=0)
    rad=max(3,int(board.shape[1]*0.025))
    for k,a in anchors.items():
        center=int(a*board.shape[1]); lo=max(0,center-rad); hi=min(board.shape[1],center+rad+1)
        seg=col_energy[lo:hi]
        out[k]=(lo+int(np.argmax(np.convolve(seg,np.ones(5)/5,mode='same'))))/board.shape[1] if len(seg) else a
    return out

def _read_number_fast(board, cx, y, half_h, base_half_w, key):
    """Use a tight crop first; retry wider only when the read is missing/weak."""
    h,w=board.shape[:2]
    def read(hw):
        x1=max(0,cx-hw); x2=min(w,cx+hw)
        y1=max(0,int(y)-half_h); y2=min(h,int(y)+half_h)
        return _read_number(board[y1:y2,x1:x2])

    val,conf=read(base_half_w)
    if val is not None and conf>=0.78:
        return val,conf

    wide_val,wide_conf=read(int(base_half_w*1.35))
    if wide_val is None:
        return val,conf
    if val is None:
        return wide_val,wide_conf
    if wide_val==val:
        return val,max(conf,wide_conf)

    # Two independent crops disagree: do not pretend the value is reliable.
    # Keep the stronger candidate for manual review, but lower confidence sharply.
    if wide_conf>conf:
        return wide_val,min(wide_conf,0.45)
    return val,min(conf,0.45)

_RAPIDOCR_ENGINE=None

def _get_rapidocr_engine():
    global _RAPIDOCR_ENGINE
    if _RAPIDOCR_ENGINE is None:
        try:
            from rapidocr import RapidOCR
        except ImportError as exc:
            raise RuntimeError(
                'RapidOCR is not installed. Run START_OCR.bat to synchronize backend dependencies.'
            ) from exc
        _RAPIDOCR_ENGINE=RapidOCR()
    return _RAPIDOCR_ENGINE

def _find_split_team_rows(board):
    """Find blue and red scoreboard rows as two separate five-row sequences."""
    detected,_=_find_row_centers(board)
    blue=[float(y) for y in detected[:5]]
    h,w=board.shape[:2]
    if len(blue)<5:
        return detected[:10],'legacy_fallback'

    gap=float(np.median(np.diff(blue)))
    if gap<=1:
        return detected[:10],'legacy_fallback'

    gray=cv2.cvtColor(board,cv2.COLOR_BGR2GRAY)
    x1=int(w*0.42); x2=int(w*0.99)
    bright=(gray[:,x1:x2]>175).astype(np.float32)
    score=bright.mean(axis=1)
    score=np.convolve(score,np.ones(7,dtype=np.float32)/7.0,mode='same')
    radius=max(3,int(gap*0.28))

    def local_peak(target):
        center=int(round(target))
        lo=max(0,center-radius); hi=min(h,center+radius+1)
        if lo>=hi:return float(center),-1.0
        idx=lo+int(np.argmax(score[lo:hi]))
        return float(idx),float(score[idx])

    start_lo=int(max(blue[-1]+gap*0.55,h*0.45))
    start_hi=int(min(blue[-1]+gap*2.40,h-gap*3.8))
    if start_hi<=start_lo:
        return detected[:10],'legacy_fallback'

    best_score=-1.0
    best_rows=None
    for red_start in range(start_lo,start_hi+1):
        rows=[]; strength=0.0; valid=True
        for k in range(5):
            y,s=local_peak(red_start+k*gap)
            if rows and y-rows[-1]<gap*0.55:
                valid=False; break
            rows.append(y); strength+=s
        if valid and strength>best_score:
            best_score=strength; best_rows=rows

    if not best_rows:
        return detected[:10],'legacy_fallback'
    return blue+best_rows,'split_team_sequence'

def _rapid_read_one(engine,image):
    result=engine(image,use_det=False,use_cls=False,use_rec=True)
    txts=getattr(result,'txts',None) or ()
    scores=getattr(result,'scores',None) or ()
    if not txts:return None,0.0
    digits=re.sub(r'\D','',str(txts[0]))
    if not digits:return None,0.0
    try:value=int(digits)
    except ValueError:return None,0.0
    score=float(scores[0]) if scores else 0.0
    return value,score

def _rapid_read_cell(engine,cell,key):
    gray=cv2.cvtColor(cell,cv2.COLOR_BGR2GRAY) if len(cell.shape)==3 else cell
    up=cv2.resize(gray,None,fx=3.0,fy=3.0,interpolation=cv2.INTER_CUBIC)
    _,bright=cv2.threshold(up,150,255,cv2.THRESH_BINARY)
    reads=[]
    max_value=99 if key in ('elims','assists','deaths') else 99999
    for image in (up,bright):
        value,score=_rapid_read_one(engine,image)
        if value is not None and value<=max_value:
            reads.append((value,score))
    if not reads:return None,0.0

    grouped={}
    for value,score in reads:
        grouped.setdefault(value,[]).append(score)
    best=max(grouped,key=lambda v:(len(grouped[v]),max(grouped[v])))
    return best,max(grouped[best])

def _highlight_row_score(board,y,gap):
    """Measure friendly-row background brightness while suppressing bright text."""
    h,w=board.shape[:2]
    y1=max(0,int(round(y-gap*0.30))); y2=min(h,int(round(y+gap*0.30)))
    x1=int(w*0.36); x2=int(w*0.985)
    crop=board[y1:y2,x1:x2]
    hsv=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)
    value=hsv[:,:,2].astype(np.float32)
    sat=hsv[:,:,1].astype(np.float32)
    mask=(value>=28)&(value<=205)&(sat>=18)
    samples=value[mask]
    if samples.size<max(40,crop.shape[0]*4):
        mask=(value>=28)&(value<=205)
        samples=value[mask]
    if samples.size==0:return 0.0
    median_v=float(np.median(samples))
    p70_v=float(np.percentile(samples,70))
    return median_v*0.70+p70_v*0.30

def _detect_me_slot(board,y_px):
    """Detect the highlighted friendly row. Return None when separation is ambiguous."""
    blue=[float(y) for y in y_px[:5]]
    if len(blue)<5:
        return None,0.0,0.0
    gap=float(np.median(np.diff(blue)))
    if gap<=1:
        return None,0.0,0.0

    scores=[_highlight_row_score(board,y,gap) for y in blue]
    order=np.argsort(scores)[::-1]
    best_idx=int(order[0]); second_idx=int(order[1])
    best=float(scores[best_idx]); second=float(scores[second_idx])
    margin_pct=(best-second)/max(abs(second),1.0)*100.0

    arr=np.array(scores,dtype=np.float32)
    median=float(np.median(arr))
    mad=float(np.median(np.abs(arr-median)))
    robust_z=(best-median)/max(mad,1.0)

    confident=margin_pct>=4.0 and robust_z>=1.0
    if not confident:
        return None,round(margin_pct,2),0.0

    confidence=min(0.99,0.50+0.50*min(1.0,max(0.0,(margin_pct-4.0)/16.0)))
    return best_idx+1,round(margin_pct,2),round(confidence,3)

def extract_team(img):
    """Read Team scoreboard stats with RapidOCR and split blue/red row detection."""
    board=_crop(img,ROI['team_board']); h,w=board.shape[:2]
    y_px,row_detection=_find_split_team_rows(board)
    if len(y_px)<10:
        return {
            'screen_type':'team','ocr_version':'0.9.11-dev','players':[],
            'layout_detection':row_detection,'stat_reading':'rapidocr_split_rows_v1',
            'me_detection_method':'row_highlight','me_detection_confidence':0.0,
            'me_detection_margin_pct':0.0,
            'hero_matching_status':'pending_reference_library'
        }

    x_cols=_find_stat_columns(board)
    gap=float(np.median(np.diff(y_px[:5]))) if len(y_px)>=5 else h*0.085
    half_h=max(8,int(gap*0.36))
    engine=_get_rapidocr_engine()
    me_slot,me_margin,me_confidence=_detect_me_slot(board,y_px)
    rows=[]

    for idx,y in enumerate(y_px[:10]):
        row={
            'team':'blue' if idx<5 else 'red',
            'slot':idx%5+1,
            'hero_id':None,
            'is_me':((idx+1)==me_slot) if (idx<5 and me_slot is not None) else (None if idx<5 else False),
            'confidence':{}
        }
        for key,xc in x_cols.items():
            half_w=int(w*(0.034 if key in ('elims','assists','deaths') else 0.054))
            cx=int(xc*w)
            x1=max(0,cx-half_w); x2=min(w,cx+half_w)
            y1=max(0,int(y)-half_h); y2=min(h,int(y)+half_h)
            value,confidence=_rapid_read_cell(engine,board[y1:y2,x1:x2],key)
            row[key]=value
            row['confidence'][key]=round(float(confidence),3)
        rows.append(row)

    return {
        'screen_type':'team',
        'ocr_version':'0.9.11-dev',
        'players':rows,
        'layout_detection':row_detection,
        'stat_reading':'rapidocr_split_rows_v1',
        'row_centers':[round(float(y),2) for y in y_px[:10]],
        'me_detection_method':'row_highlight',
        'me_detection_slot':me_slot,
        'me_detection_confidence':me_confidence,
        'me_detection_margin_pct':me_margin,
        'hero_matching_status':'pending_reference_library'
    }

def _detect_personal_cards(img):
    """Detect Overwatch personal-stat cards from their orange left accent bars."""
    h,w=img.shape[:2]
    hsv=cv2.cvtColor(img,cv2.COLOR_BGR2HSV)
    # OW stat cards use a saturated orange accent. This is more stable than dark card edges.
    m1=cv2.inRange(hsv,np.array([3,150,150]),np.array([18,255,255]))
    n,labels,stats,cents=cv2.connectedComponentsWithStats(m1,8)
    bars=[]
    for i in range(1,n):
        x,y,bw,bh,area=stats[i]
        if bh>h*.055 and bh<h*.16 and bw<w*.012 and bw>=2 and x>w*.18 and y>h*.12 and y<h*.78:
            bars.append((x,y,bw,bh))
    bars=sorted(bars,key=lambda r:(r[1],r[0]))
    # Merge near-duplicate components from one accent bar.
    uniq=[]
    for r in bars:
        cx=r[0]+r[2]/2; cy=r[1]+r[3]/2
        if any(abs(cx-(q[0]+q[2]/2))<w*.015 and abs(cy-(q[1]+q[3]/2))<h*.04 for q in uniq):continue
        uniq.append(r)
    if len(uniq)>=6:
        # infer regular card width/height from screen geometry; boxes begin just left of accent bar.
        stat=[]
        for x,y,bw,bh in uniq[:7]:
            x1=max(0,(x-w*.018)/w); x2=min(1,(x+w*.235)/w)
            y1=max(0,(y-h*.025)/h); y2=min(1,(y+h*.145)/h)
            stat.append((x1,y1,x2,y2))
        # hero summary is the top-left card immediately before first stat card.
        top=min(stat,key=lambda b:b[1])
        hero=(max(.18,top[0]-.255),top[1],top[0]-.004,top[3])
        boxes=[hero]+stat
        return boxes[:8],'detected_orange_bars'
    fallback=[(0.205,0.190,0.455,0.400),(0.460,0.190,0.710,0.400),(0.715,0.190,0.965,0.400),
              (0.205,0.405,0.455,0.620),(0.460,0.405,0.710,0.620),(0.715,0.405,0.965,0.620),
              (0.205,0.625,0.455,0.840),(0.460,0.625,0.710,0.840)]
    return fallback,'fallback'

def _card_text(img, box):
    # OCR one detected/fallback card without depending on the removed v0.9.7 helper.
    return _ocr(_crop(img, box), 6)

def _personal_card_value(img,box):
    """Read the value area separately from label area to avoid mixing neighboring numbers."""
    x1,y1,x2,y2=box
    # In these cards the prominent value occupies upper ~55%; label is lower portion.
    value_box=(x1,y1,x2,y1+(y2-y1)*0.58)
    crop=_crop(img,value_box)
    variants=[]
    for inv in (False,True):
        prep=_prep(crop,3.0,invert=inv)
        txt=pytesseract.image_to_string(prep,lang='eng',config='--psm 6 -c tessedit_char_whitelist=0.2.556789:%.,').strip()
        vals=re.findall(r'\d{1,2}:\d{2}|\d+(?:\.\d+)?%?',txt)
        variants.extend(vals)
    # prefer semantically richer tokens, then agreement
    if not variants:return None,[],0.0
    counts={v:variants.count(v) for v in set(variants)}
    def rank(v):return (counts[v], ':' in v or '%' in v or '.' in v, len(v))
    best=max(counts,key=rank)
    return best,variants,0.92 if counts[best]>=2 else 0.72

def extract_personal(img):
    panel_text=_ocr(_crop(img,ROI['personal_panel']),6)
    boxes,layout=_detect_personal_cards(img)
    metric_cards=[]
    names=['hero_summary']+[f'metric_{i}' for i in range(1,len(boxes))]
    for name,box in zip(names,boxes):
        raw=_card_text(img,box)
        primary,value_reads,conf=_personal_card_value(img,box)
        vals=re.findall(r'\d{1,2}:\d{2}|\d+(?:\.\d+)?%?',raw)
        metric_cards.append({'slot':name,'primary_value':primary,'value_reads':value_reads,
                             'values':vals,'raw_text':raw,'confidence':conf})
    # Generic, label-aware facts stay authoritative when clearly present in whole-panel OCR.
    play_time=None
    m=re.search(r'\b(\d{1,2}:\d{2})\b[^\n]*\n?[^\n]*플레이\s*시간|플레이\s*시간[^\n]*(\d{1,2}:\d{2})',panel_text)
    if m:play_time=m.group(1) or m.group(2)
    if not play_time:
        m=re.search(r'\b(\d{1,2}:\d{2})\b',panel_text)
        if m:play_time=m.group(1)
    known={}
    m=re.search(r'(\d{1,3})%[^\n]*\n?[^\n]*무기\s*명중률|무기\s*명중률[^\n]*(\d{1,3})%',panel_text)
    if m:known['weapon_accuracy']=(m.group(1) or m.group(2))+'%'
    m=re.search(r'10분당\s*평균\s*[:：]?\s*(\d+(?:\.\d+)?)',panel_text)
    if m:known['per_10_min_average']=m.group(1)
    return {'screen_type':'personal','ocr_version':'0.9.9.1-dev','play_time':play_time,
            'known_metrics':known,'layout_detection':layout,'metric_cards':metric_cards,'raw_text':panel_text}

def _event_type(label):
    if '시작' in label:return 'start'
    if '종료' in label:return 'end'
    if '죽음' in label:return 'death'
    if '궁극기' in label:return 'ultimate'
    if '추가' in label and '시간' in label:return 'overtime'
    if '처치' in label:return 'elimination'
    if '생명력' in label and '획득' in label:return 'health_gained'
    return 'other'

def extract_replay(img):
    text=_ocr(_crop(img,ROI['replay_events']),6)
    raw_events=[]
    for line in [x.strip() for x in text.splitlines() if x.strip()]:
        m=re.search(r'(\d{1,2}:\d{2}|\d{3,4})\s*[|ㅣ]?\s*$',line)
        if not m: continue
        label=line[:m.start()].strip(' -·ㆍ|ㅣ')
        raw_events.append((line,m.group(1),label,_event_type(label)))

    # A clear end timestamp gives an upper bound for colon-dropped OCR.
    end_seconds=None
    for _,tok,_,et in raw_events:
        if et=='end' and ':' in tok:
            end_seconds=_time_to_seconds(tok)

    events=[]; last_time=-1
    for line,raw_time,label,et in raw_events:
        norm=_normalize_mmss(raw_time)
        inferred=':' not in raw_time
        if inferred and len(raw_time)==4 and raw_time.isdigit():
            # Common OCR: 2:25 -> 2125, 3:01 -> 3101. First try dropping
            # the spurious second digit when the naive 21:25/31:01 exceeds match end.
            naive=_normalize_mmss(raw_time)
            naive_sec=_time_to_seconds(naive) if naive else None
            alt=f'{int(raw_time[0])}:{raw_time[-2:]}' if int(raw_time[-2:])<60 else None
            alt_sec=_time_to_seconds(alt) if alt else None
            if end_seconds is not None and naive_sec is not None and naive_sec>end_seconds and alt_sec is not None and alt_sec<=end_seconds:
                norm=alt
        if not norm: continue
        seconds=_time_to_seconds(norm)
        monotonic=seconds is not None and seconds>=last_time
        needs_review=inferred or et=='other' or not monotonic
        confidence=0.96 if (not inferred and et!='other' and monotonic) else 0.72 if (inferred and et!='other' and monotonic) else 0.45
        events.append({'raw_line':line,'time_raw':raw_time,'time':norm,'time_seconds':seconds,
                       'type':et,'label_raw':label,'confidence':confidence,'needs_review':needs_review})
        if seconds is not None and monotonic: last_time=seconds
    clock_text=_ocr(_crop(img,ROI['replay_clock']),7)
    return {'screen_type':'replay','ocr_version':'0.9.9.1-dev','events':events,'clock_raw':clock_text,'raw_text':text}

def extract(img,screen_type):
    funcs={'summary':extract_summary,'team':extract_team,'personal':extract_personal,'replay':extract_replay}
    if screen_type not in funcs: raise ValueError(f'unsupported screen_type: {screen_type}')
    return funcs[screen_type](img)
