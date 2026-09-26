from __future__ import annotations
import re, os, shutil
from pathlib import Path
from typing import Any
import cv2
import numpy as np
import pytesseract
from orca_ocr.personal_metrics import infer_hero_from_metric_labels, metric_from_verified_order, resolve_hero_key, resolve_metric_label


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


def _summary_result_reads(img):
    """Read Summary result text with several crops/PSM modes.

    The large WIN/LOSS label is visually stylized and a single OCR pass can miss
    one Korean syllable, so keep multiple raw candidates for robust matching.
    """
    boxes=[
        (0.670,0.545,0.825,0.640),
        (0.680,0.555,0.805,0.635),
        (0.675,0.565,0.940,0.735),
    ]
    reads=[]
    for box in boxes:
        crop=_crop(img,box)
        for psm in (6,7,11):
            try:
                txt=_ocr(crop,psm=psm,lang='kor+eng')
                if txt:
                    reads.append(txt)
            except Exception:
                pass
    return reads


def _summary_result_from_text(reads):
    combined='\n'.join(reads or [])
    compact=re.sub(r'[^가-힣A-Za-z]','',combined).lower()

    # Korean UI labels. Removing whitespace/punctuation first also catches "승 리".
    if '승리' in compact:
        return 'win','ocr_keyword'
    if '패배' in compact:
        return 'loss','ocr_keyword'
    if '무승부' in compact or '무승' in compact:
        return 'draw','ocr_keyword'

    # English fallback in case the client language changes.
    if 'victory' in compact or re.search(r'\bwin\b',combined,re.I):
        return 'win','ocr_keyword'
    if 'defeat' in compact or re.search(r'\bloss\b',combined,re.I):
        return 'loss','ocr_keyword'
    if 'draw' in compact or 'tie' in compact:
        return 'draw','ocr_keyword'

    return None,None


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

    # Map OCR is optional. A failure here must never fail the whole Summary extraction.
    try:
        field_raw['map_name'] = _ocr_box(img, (0.670, 0.155, 0.930, 0.220), 7)
    except Exception as exc:
        field_raw['map_name'] = ''
        field_raw['map_name_error'] = f'{type(exc).__name__}: {exc}'

    result_reads=_summary_result_reads(img)
    # Preserve the original fixed result crop in debug output as well.
    result_reads.insert(0,field_raw['result'])
    result_reads.append(text)

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
    patterns = [
        r'(\d+)\s*(?:VS|V5|V[S5])\s*(\d+)',
        # Common OCR collapse of "1 VS 0" -> "115 0" / "145 0".
        # V is frequently read as 1 or 4, and S as 5.
        r'최종\s*점수\s*[:：]?\s*(\d)\s*[VvYy14Il|]\s*[Ss5]\s*(\d)',
        r'최종\s*점수\s*[:：]?\s*(\d)\s*[1Il|]?5\s*(\d)',
        # "최종" itself is often unreadable. As long as OCR still sees "점수",
        # accept the same VS-confused separator immediately after it.
        r'점수\s*[:：]?\s*(\d)\s*[VvYy14Il|]\s*[Ss5]\s*(\d)',
        r'점수\s*[:：]?\s*(\d)\s*[1Il|]?5\s*(\d)',
    ]
    for pat in patterns:
        m = re.search(pat, score_source, re.I)
        if m:
            score = [int(m.group(1)), int(m.group(2))]; break

    # Final fallback for collapsed OCR such as "점수: 115 0" or "점수: 145 0".
    # Interpret 1?5 as "1 VS" only in the immediate score context.
    if score is None:
        m=re.search(r'점수\s*[:：]?\s*(\d)(?:1|4)5\s*(\d)',score_source,re.I)
        if m:
            score=[int(m.group(1)),int(m.group(2))]

    result,result_source=_summary_result_from_text(result_reads)
    if result is None and score and len(score)==2:
        if score[0]>score[1]:
            result='win'
        elif score[0]<score[1]:
            result='loss'
        else:
            result='draw'
        result_source='final_score'

    mode = None
    mode_source = field_raw['mode'] + '\n' + text
    m = re.search(r'(?:게임\s*)?모드\s*[:：]?\s*([^\n]+)', mode_source)
    if m: mode = m.group(1).strip(' ·ㆍ|')
    elif '혼합' in mode_source: mode = '혼합'

    map_name = None
    map_raw = field_raw.get('map_name', '').strip()
    if map_raw:
        # Keep the first non-empty OCR line and trim surrounding UI punctuation/noise.
        map_lines = []
        for line in map_raw.splitlines():
            cleaned = re.sub(r'^[^0-9A-Za-z가-힣]+|[^0-9A-Za-z가-힣 ]+$', '', line).strip()
            if cleaned:
                map_lines.append(cleaned)
        if map_lines:
            map_name = map_lines[0]

    played_at_raw = None
    date_source = field_raw['date'] + '\n' + text
    m = re.search(r'(\d{1,2}/\d{1,2}/\d{2,4}\s*[-–]\s*\d{1,2}:\d{2})', date_source)
    if m:
        played_at_raw = m.group(1)

    return {
        'screen_type':'summary','ocr_version':'0.9.17-dev','result':result,'result_source':result_source,
        'duration_seconds':duration,'final_score':score,'mode':mode,
        'map_name':map_name,'played_at_raw':played_at_raw,
        'confidence':{
            'duration':0.98 if duration is not None else 0.0,
            'final_score':0.82 if score else 0.0,
            'mode':0.92 if mode else 0.0,
            'map_name':0.92 if map_name else 0.0,
            'result':0.97 if result_source=='ocr_keyword' else 0.90 if result_source=='final_score' else 0.0,
            'played_at_raw':0.95 if played_at_raw else 0.0,
        },
        'field_raw':field_raw,'result_reads':result_reads,'raw_text':text
    }

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

_HERO_NAME_KO={
    'ana':'아나','anran':'안란','ashe':'애쉬','baptiste':'바티스트','bastion':'바스티온',
    'brigitte':'브리기테','cassidy':'캐서디','dmon':'디몬','domina':'도미나','doomfist':'둠피스트',
    'dva':'디바','echo':'에코','emre':'엠레','freja':'프레야','genji':'겐지','hanzo':'한조',
    'hazard':'해저드','illari':'일리아리','jetpack-cat':'제트팩 캣','junker-queen':'정커퀸',
    'junkrat':'정크랫','juno':'주노','kiriko':'키리코','lifeweaver':'라이프위버','lucio':'루시우',
    'mauga':'마우가','mei':'메이','mercy':'메르시','mizuki':'미즈키','moira':'모이라',
    'orisa':'오리사','pharah':'파라','ramattra':'라마트라','reaper':'리퍼','reinhardt':'라인하르트',
    'roadhog':'로드호그','shion':'시온','sierra':'시에라','sigma':'시그마','sojourn':'소전',
    'soldier-76':'솔저: 76','sombra':'솜브라','symmetra':'시메트라','torbjorn':'토르비욘',
    'tracer':'트레이서','vendetta':'벤데타','venture':'벤처','widowmaker':'위도우메이커',
    'winston':'윈스턴','wrecking-ball':'레킹볼','wuyang':'우양','zarya':'자리야','zenyatta':'젠야타',
}


def _hero_name_ko(hero_key):
    if not hero_key:
        return None
    return _HERO_NAME_KO.get(str(hero_key),str(hero_key))


_HERO_REFERENCE_CACHE=None
_HERO_ROLE_CACHE=None


def _hero_role_for_slot(slot:int)->str:
    if slot==1:
        return 'tank'
    if slot in (2,3):
        return 'damage'
    return 'support'


def _hero_norm(img,size=160):
    h,w=img.shape[:2]
    x1=int(w*.10); x2=int(w*.90)
    y1=int(h*.05); y2=int(h*.95)
    roi=img[y1:y2,x1:x2]
    gray=cv2.cvtColor(roi,cv2.COLOR_BGR2GRAY)
    gray=cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8)).apply(gray)
    return cv2.resize(gray,(size,size),interpolation=cv2.INTER_AREA)


def _hero_corr(a,b):
    a=_hero_norm(a).astype(np.float32); b=_hero_norm(b).astype(np.float32)
    a-=float(a.mean()); b-=float(b.mean())
    denom=float(np.linalg.norm(a)*np.linalg.norm(b))
    if denom<=1e-6:
        return 0.0
    return max(0.0,min(1.0,float(np.sum(a*b)/denom)))


def _hero_feature_similarity(a,b):
    a=_hero_norm(a); b=_hero_norm(b)
    if hasattr(cv2,'SIFT_create'):
        det=cv2.SIFT_create(nfeatures=240); norm=cv2.NORM_L2
    else:
        det=cv2.ORB_create(nfeatures=300,fastThreshold=6); norm=cv2.NORM_HAMMING
    ka,da=det.detectAndCompute(a,None); kb,db=det.detectAndCompute(b,None)
    if da is None or db is None or len(ka)<4 or len(kb)<4:
        return 0.0
    pairs=cv2.BFMatcher(norm).knnMatch(da,db,k=2)
    good=0
    for pair in pairs:
        if len(pair)<2:
            continue
        m,n=pair
        if m.distance<0.74*n.distance:
            good+=1
    return min(1.0,good/max(8,min(len(ka),len(kb))))


def _hero_similarity(a,b):
    return _hero_feature_similarity(a,b)*0.82+_hero_corr(a,b)*0.18


def _load_hero_references():
    global _HERO_REFERENCE_CACHE,_HERO_ROLE_CACHE
    if _HERO_REFERENCE_CACHE is not None:
        return _HERO_REFERENCE_CACHE
    root=Path(__file__).resolve().parent/'hero_references'
    library={}
    roles={}
    manifest=root/'manifest.json'
    if manifest.exists():
        try:
            import json
            payload=json.loads(manifest.read_text(encoding='utf-8'))
            raw_roles=payload.get('roles',{}) if isinstance(payload,dict) else {}
            if isinstance(raw_roles,dict):
                roles={str(k):str(v) for k,v in raw_roles.items()}
        except Exception:
            roles={}
    if root.exists():
        for hero_dir in root.iterdir():
            if not hero_dir.is_dir():
                continue
            refs=[]
            for p in hero_dir.iterdir():
                if p.suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):
                    continue
                img=cv2.imread(str(p),cv2.IMREAD_COLOR)
                if img is not None:
                    refs.append(img)
            if refs:
                library[hero_dir.name]=refs
    _HERO_REFERENCE_CACHE=library
    _HERO_ROLE_CACHE=roles
    return library


def _team_hero_row_centers(board):
    """Fixed Team portrait-row geometry, independent from numeric OCR row detection."""
    h=board.shape[0]
    # Five blue rows, VS gap, five red rows in the current Team scoreboard layout.
    return [v*h for v in (0.092,0.167,0.242,0.317,0.392,0.598,0.673,0.748,0.823,0.898)]


def _crop_team_hero(board,y,gap):
    h,w=board.shape[:2]
    half_h=max(10,int(gap*.42))
    x1=int(w*.034); x2=int(w*.112)
    y1=max(0,int(round(y))-half_h); y2=min(h,int(round(y))+half_h)
    return board[y1:y2,x1:x2]


def _match_team_hero(crop,slot):
    library=_load_hero_references()
    if not library:
        return None,0.0
    expected_role=_hero_role_for_slot(slot)
    roles=_HERO_ROLE_CACHE or {}
    best_id=None; best_score=-1.0; second=-1.0
    for hero_id,refs in library.items():
        if roles and roles.get(hero_id) != expected_role:
            continue
        scores=sorted((_hero_similarity(crop,ref) for ref in refs),reverse=True)
        if not scores:
            score=0.0
        else:
            top=scores[:2]
            score=sum(top)/len(top)
        if score>best_score:
            second=best_score; best_score=score; best_id=hero_id
        elif score>second:
            second=score
    margin=max(0.0,best_score-max(second,0.0))
    confidence=min(0.99,max(0.0,best_score*.85+margin*1.5))
    return best_id,round(confidence,3)


def _team_color_block_rows(board):
    """Detect actual blue/red scoreboard block heights and derive visible row centers.

    Overwatch compresses a team block when a player has left. A 4-player team is
    therefore four rows tall rather than five rows with one empty hole.
    """
    h,w=board.shape[:2]
    b,g,r=cv2.split(board)

    blue_mask=(
        (b.astype(np.int16) > r.astype(np.int16)*1.05) &
        (b.astype(np.int16) > g.astype(np.int16)*0.90) &
        (b > 70)
    )
    red_mask=(
        (r.astype(np.int16) > g.astype(np.int16)*1.15) &
        (r.astype(np.int16) > b.astype(np.int16)*1.15) &
        (r > 70)
    )

    x1=int(w*0.02); x2=int(w*0.98)

    def largest_run(mask):
        profile=mask[:,x1:x2].mean(axis=1).astype(np.float32)
        profile=np.convolve(profile,np.ones(5,dtype=np.float32)/5.0,mode='same')
        active=profile>0.15
        runs=[]; st=None
        for i,v in enumerate(active):
            if v and st is None:
                st=i
            if st is not None and (not v or i==len(active)-1):
                en=i if not v else i+1
                if en-st>=20:
                    runs.append((st,en,float(profile[st:en].mean())))
                st=None
        if not runs:
            return None
        return max(runs,key=lambda item:(item[1]-item[0],item[2]))

    blue_run=largest_run(blue_mask)
    red_run=largest_run(red_mask)
    if not blue_run or not red_run:
        return None

    blue_h=float(blue_run[1]-blue_run[0])
    red_h=float(red_run[1]-red_run[0])
    # Friendly team is expected to have five rows in normal play and gives a stable
    # row-height reference even when the enemy team has a leaver.
    base_row_h=blue_h/5.0 if blue_h>0 else h*0.075
    blue_count=max(1,min(5,int(round(blue_h/max(base_row_h,1.0)))))
    red_count=max(1,min(5,int(round(red_h/max(base_row_h,1.0)))))

    def centers(run,count):
        a,b,_=run
        row_h=(b-a)/max(count,1)
        return [a+(i+0.5)*row_h for i in range(count)]

    return {
        'blue_rows':centers(blue_run,blue_count),
        'red_rows':centers(red_run,red_count),
        'blue_count':blue_count,
        'red_count':red_count,
        'blue_run':[int(blue_run[0]),int(blue_run[1])],
        'red_run':[int(red_run[0]),int(red_run[1])],
    }


def extract_team(img):
    """Read Team scoreboard stats, including compressed 5v4 / 4v5 scoreboards."""
    global _HERO_ROLE_CACHE
    board=_crop(img,ROI['team_board']); h,w=board.shape[:2]
    layout=_team_color_block_rows(board)

    if layout:
        blue_rows=[float(y) for y in layout['blue_rows']]
        red_rows=[float(y) for y in layout['red_rows']]
        y_px=blue_rows+red_rows
        row_detection='team_color_blocks'
    else:
        legacy_rows,row_detection=_find_split_team_rows(board)
        blue_rows=[float(y) for y in legacy_rows[:5]]
        red_rows=[float(y) for y in legacy_rows[5:10]]
        y_px=blue_rows+red_rows
        layout={
            'blue_count':len(blue_rows),
            'red_count':len(red_rows),
            'blue_run':None,
            'red_run':None,
        }

    if not blue_rows or not red_rows:
        return {
            'screen_type':'team','ocr_version':'0.9.14-dev','players':[],
            'layout_detection':row_detection,'stat_reading':'rapidocr_variable_rows_v1',
            'me_detection_method':'row_highlight','me_detection_confidence':0.0,
            'me_detection_margin_pct':0.0,
            'hero_matching_status':'scoreboard_native_v1',
            'visible_player_count':0,
        }

    x_cols=_find_stat_columns(board)
    blue_gap=float(np.median(np.diff(blue_rows))) if len(blue_rows)>=2 else h*0.075
    red_gap=float(np.median(np.diff(red_rows))) if len(red_rows)>=2 else blue_gap
    engine=_get_rapidocr_engine()

    # is_me detection expects friendly rows only; pad nowhere, because blue may also
    # be compressed in future leaver cases.
    me_slot=None; me_margin=0.0; me_confidence=0.0
    if len(blue_rows)>=2:
        scores=[_highlight_row_score(board,y,blue_gap) for y in blue_rows]
        order=np.argsort(scores)[::-1]
        if len(order)>=2:
            best_idx=int(order[0]); second_idx=int(order[1])
            best=float(scores[best_idx]); second=float(scores[second_idx])
            margin_pct=(best-second)/max(abs(second),1.0)*100.0
            arr=np.array(scores,dtype=np.float32)
            median=float(np.median(arr))
            mad=float(np.median(np.abs(arr-median)))
            robust_z=(best-median)/max(mad,1.0)
            if margin_pct>=4.0 and robust_z>=1.0:
                me_slot=best_idx+1
                me_margin=round(margin_pct,2)
                me_confidence=round(min(0.99,0.50+0.50*min(1.0,max(0.0,(margin_pct-4.0)/16.0))),3)

    hero_library=_load_hero_references()
    rows=[]

    groups=(('blue',blue_rows,blue_gap),('red',red_rows,red_gap))
    for team_name,team_rows,team_gap in groups:
        partial=len(team_rows)<5
        half_h=max(8,int(team_gap*0.36))
        for local_idx,y in enumerate(team_rows):
            slot=local_idx+1
            hero_crop=_crop_team_hero(board,y,team_gap)

            if partial:
                # In a compressed team the missing role may be in the middle, so row
                # index no longer guarantees tank/damage/support. Match across all roles.
                roles_backup=_HERO_ROLE_CACHE
                try:
                    _HERO_ROLE_CACHE={}
                    hero_id,hero_confidence=_match_team_hero(hero_crop,slot)
                finally:
                    _HERO_ROLE_CACHE=roles_backup
            else:
                hero_id,hero_confidence=_match_team_hero(hero_crop,slot)

            row={
                'team':team_name,
                'slot':slot,
                'hero_key':hero_id,
                'hero_id':_hero_name_ko(hero_id),
                'is_me':(
                    (slot==me_slot) if (team_name=='blue' and me_slot is not None)
                    else (None if team_name=='blue' else False)
                ),
                'confidence':{'hero_id':hero_confidence},
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
        'ocr_version':'0.9.14-dev',
        'players':rows,
        'layout_detection':row_detection,
        'stat_reading':'rapidocr_variable_rows_v1',
        'row_centers':{
            'blue':[round(float(y),2) for y in blue_rows],
            'red':[round(float(y),2) for y in red_rows],
        },
        'team_counts':{
            'blue':len(blue_rows),
            'red':len(red_rows),
        },
        'team_block_bounds':{
            'blue':layout.get('blue_run'),
            'red':layout.get('red_run'),
        },
        'me_detection_method':'row_highlight',
        'me_detection_slot':me_slot,
        'me_detection_confidence':me_confidence,
        'me_detection_margin_pct':me_margin,
        'hero_matching_status':'scoreboard_native_v1',
        'visible_player_count':len(rows),
        'hero_reference_heroes':len(hero_library),
        'hero_reference_images':sum(len(v) for v in hero_library.values()),
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
        for x,y,bw,bh in uniq[:8]:
            x1=max(0,(x-w*.018)/w); x2=min(1,(x+w*.235)/w)
            y1=max(0,(y-h*.025)/h); y2=min(1,(y+h*.145)/h)
            stat.append((x1,y1,x2,y2))
        # hero summary is the top-left card immediately before first stat card.
        top=min(stat,key=lambda b:b[1])
        hero=(max(.18,top[0]-.255),top[1],top[0]-.004,top[3])
        boxes=[hero]+stat
        return boxes[:9],'detected_orange_bars'
    fallback=[(0.205,0.190,0.455,0.400),(0.460,0.190,0.710,0.400),(0.715,0.190,0.965,0.400),
              (0.205,0.405,0.455,0.620),(0.460,0.405,0.710,0.620),(0.715,0.405,0.965,0.620),
              (0.205,0.625,0.455,0.840),(0.460,0.625,0.710,0.840),(0.715,0.625,0.965,0.840)]
    return fallback,'fallback'

def _card_text(img, box):
    # OCR one detected/fallback card without depending on the removed v0.9.7 helper.
    return _ocr(_crop(img, box), 6)

def _personal_card_value(img,box):
    """Read the value area separately from label area to avoid mixing neighboring numbers."""
    x1,y1,x2,y2=box
    # Main values sit to the right of the large stat icon. Cropping the icon out
    # prevents shapes from being recognized as digits (e.g. Ana 3 -> 104).
    value_box=(x1+(x2-x1)*0.34,y1,x2,y1+(y2-y1)*0.58)
    crop=_crop(img,value_box)
    variants=[]
    for inv in (False,True):
        prep=_prep(crop,3.0,invert=inv)
        txt=pytesseract.image_to_string(
            prep,lang='eng',
            config='--psm 6 -c tessedit_char_whitelist=0123456789:%.,'
        ).strip()
        vals=re.findall(r'\d{1,2}:\d{2}|\d+(?:\.\d+)?%?',txt)
        variants.extend(vals)
    if not variants:return None,[],0.0
    counts={v:variants.count(v) for v in set(variants)}
    def rank(v):return (counts[v], ':' in v or '%' in v or '.' in v, len(v))
    best=max(counts,key=rank)
    return best,variants,0.92 if counts[best]>=2 else 0.72


def _personal_card_label(img,box):
    """Read only the lower label portion of one Personal stat card."""
    x1,y1,x2,y2=box
    label_box=(x1,y1+(y2-y1)*0.48,x2,y2)
    crop=_crop(img,label_box)
    reads=[]
    for psm in (6,7):
        text=_ocr(crop,psm=psm,lang='kor+eng')
        if text:
            reads.extend(line.strip() for line in text.splitlines() if line.strip())
    if not reads:
        return '',0.0

    # Prefer text containing Korean letters and avoid tokens that are only numeric.
    def score(value):
        korean=len(re.findall(r'[가-힣]',value))
        numeric_only=bool(re.fullmatch(r'[\d\s:%.]+',value))
        return (not numeric_only,korean,len(value))

    best=max(reads,key=score)
    confidence=0.90 if sum(1 for v in reads if v==best)>=2 else 0.72
    return best,confidence

def _personal_tokens(raw):
    """Extract display-value tokens while keeping comma-formatted integers intact."""
    return re.findall(r'\d{1,2}:\d{2}|\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?%?',raw or '')


def _personal_primary_from_raw(raw,label_raw):
    """Prefer the value rendered in the whole card over isolated value OCR."""
    tokens=_personal_tokens(raw)
    if not tokens:
        return None

    label=label_raw or ''
    if '명중률' in label or '적중률' in label:
        pct=next((v for v in tokens if v.endswith('%')),None)
        if pct:
            return pct
    if '시간' in label:
        tm=next((v for v in tokens if ':' in v),None)
        if tm:
            return tm

    # The first visible number is the main card value. Per-10-minute values appear
    # later and must not replace it.
    return tokens[0]


def _personal_hero_name_text(img):
    """Read selected hero name from the left Personal-screen navigation."""
    text=_ocr_box(img,(0.025,0.185,0.195,0.255),psm=7,lang='kor+eng')
    return text


def _personal_label_from_raw(raw):
    """Recover a metric label from whole-card OCR when the lower label crop is poor."""
    lines=[line.strip() for line in (raw or '').splitlines() if line.strip()]
    candidates=[]
    for line in lines:
        # Per-10-minute helper text is not the metric label.
        if '10분당' in line or '평균:' in line or '평균：' in line:
            continue
        stripped=re.sub(r'^[^A-Za-z가-힣]+','',line).strip()
        stripped=re.sub(r'^\d+(?:[.,]\d+)?%?\s*','',stripped).strip()
        if not stripped:
            continue
        korean=len(re.findall(r'[가-힣]',stripped))
        if korean>=2:
            candidates.append((korean,len(stripped),stripped))
    if not candidates:
        return ''
    return max(candidates,key=lambda item:(item[0],item[1]))[2]


def _symmetra_average_charge_from_panel(panel_text):
    """Fallback for the fixed Symmetra average-charge card when its value crop is faint."""
    if not panel_text:
        return None
    compact=panel_text.replace('\r','')
    pos=compact.find('평균 충전 계수')
    if pos<0:
        pos=compact.find('평균 중전 계수')
    if pos<0:
        return None
    before=compact[max(0,pos-120):pos]
    decimals=re.findall(r'\b\d+(?:\.\d+)\b',before)
    if not decimals:
        return None
    return decimals[-1]


def extract_personal(img, hero_key=None):
    panel_text=_ocr(_crop(img,ROI['personal_panel']),6)
    boxes,layout=_detect_personal_cards(img)

    # The API only receives screen_type + image, so infer the selected hero from
    # the hero-summary card before resolving hero-specific metric labels.
    hero_summary_raw=_card_text(img,boxes[0]) if boxes else ''
    hero_name_raw=_personal_hero_name_text(img)

    name_hero_key=hero_key or (
        resolve_hero_key(hero_name_raw)
        or resolve_hero_key(hero_summary_raw)
        or resolve_hero_key(panel_text)
    )

    # Metric inference always runs and only uses hero-unique labels. This prevents
    # shared stats from forcing an unrelated hero and then triggering bad card-order mapping.
    hero_metric_inference={"hero_key":None,"confidence":0.0,"matches":[]}
    if len(boxes)>1:
        pre_labels=[]
        for box in boxes[1:]:
            label_raw,_=_personal_card_label(img,box)
            if label_raw:
                pre_labels.append(label_raw)
            raw_label=_personal_label_from_raw(_card_text(img,box))
            if raw_label and raw_label not in pre_labels:
                pre_labels.append(raw_label)
        hero_metric_inference=infer_hero_from_metric_labels(pre_labels)

    metric_hero_key=hero_metric_inference.get("hero_key")
    # Two or more hero-unique metric labels are stronger evidence than the
    # hero-name OCR, which can read another hero name entirely on this screen.
    hero_key=metric_hero_key or name_hero_key

    metric_cards=[]
    metrics=[]
    names=['hero_summary']+[f'metric_{i}' for i in range(1,len(boxes))]
    for name,box in zip(names,boxes):
        raw=_card_text(img,box)
        isolated_primary,value_reads,value_conf=_personal_card_value(img,box)
        label_raw,label_conf=_personal_card_label(img,box)
        vals=_personal_tokens(raw)
        resolved=resolve_metric_label(label_raw,hero_key)

        # If label OCR is unusable, fall back to the verified card order for this hero.
        # name is metric_N, so metric_1 maps to index 0.
        if not resolved.get('metric_key') and name.startswith('metric_'):
            try:
                metric_index=int(name.split('_',1)[1])-1
            except (ValueError,IndexError):
                metric_index=-1
            ordered=metric_from_verified_order(hero_key,metric_index)
            if ordered:
                resolved={**resolved,**ordered}
                # Verified hero card order is authoritative when the label crop is blank/noisy.
                label_conf=max(label_conf,0.88)

        # If the dedicated label crop grabbed helper text/noise, retry using the
        # whole card OCR. This commonly recovers labels such as "결정타".
        raw_label=_personal_label_from_raw(raw)
        raw_resolved=resolve_metric_label(raw_label,hero_key) if raw_label else None
        if (
            raw_resolved
            and raw_resolved.get('metric_key')
            and (
                not resolved.get('metric_key')
                or '10분당' in label_raw
                or raw_resolved.get('label_match_score',0)>resolved.get('label_match_score',0)
            )
        ):
            label_raw=raw_label
            resolved=raw_resolved
            label_conf=max(label_conf,0.88)

        raw_primary=_personal_primary_from_raw(raw,label_raw)
        # Trust the isolated numeric OCR when repeated reads agree. It excludes
        # icons/helper text and is more reliable than whole-card OCR in cases such
        # as Ana 3 -> 104, saved players 4 -> 0, slept enemies 6 -> 4, scoped 73% -> 0.
        if (
            raw_primary is not None
            and ',' in raw_primary
            and isolated_primary is not None
            and raw_primary.replace(',','').endswith(isolated_primary.replace(',',''))
        ):
            # Isolated value OCR can clip the leading thousands digit
            # (e.g. 2,183 -> 183). Whole-card OCR preserves comma-formatted totals.
            primary=raw_primary
            value_conf=max(value_conf,0.90)
        elif isolated_primary is not None and value_conf>=0.90:
            primary=isolated_primary
        else:
            primary=raw_primary if raw_primary is not None else isolated_primary

        # The Symmetra average-charge value can be too faint for the individual
        # card crop while still being present in the whole-panel OCR.
        if (
            primary is None
            and hero_key=='symmetra'
            and resolved.get('metric_key')=='average_charge'
        ):
            primary=_symmetra_average_charge_from_panel(panel_text)
            if primary is not None:
                value_conf=max(value_conf,0.82)

        if raw_primary is not None:
            value_conf=max(value_conf,0.90)
        card={
            'slot':name,
            'label_raw':label_raw,
            'primary_value':primary,
            'value_reads':value_reads,
            'values':vals,
            'raw_text':raw,
            'confidence':{
                'value':value_conf,
                'label':label_conf,
            },
            **resolved,
        }
        metric_cards.append(card)
        if primary is not None and name!='hero_summary':
            metrics.append({
                'metric_key':resolved['metric_key'],
                'scope':resolved['scope'],
                'label_raw':label_raw,
                'label_normalized':resolved['label_normalized'],
                'value':primary,
                'confidence':round(min(value_conf,label_conf),2),
                'needs_review':resolved['needs_review'] or value_conf<0.70 or label_conf<0.70,
            })

    play_time=None
    # Prefer the hero-summary card. Normalize common OCR damage in the time:
    # 0001.22 -> 01:22, and 90:50 -> 00:50 when the leading 0 was read as 9.
    hero_times=[]
    for raw_time in re.findall(r'\b\d{1,4}[.:]\d{2}\b',hero_summary_raw):
        left,right=re.split(r'[.:]',raw_time,1)
        left=left.lstrip('0') or '0'
        if len(left)==2 and left.startswith('9') and int(left)>45:
            left='0'+left[1:]
        candidate=f"{int(left):02d}:{right}"
        mm,ss=(int(v) for v in candidate.split(':'))
        if ss<60 and mm*60+ss<=45*60:
            hero_times.append(candidate)
    if hero_times:
        play_time=hero_times[-1]
    if play_time is None:
        # Hero-summary OCR sometimes reads the ':' in MM:SS as '1' (e.g. 01:25 -> 01125).
        for damaged in re.findall(r'\b\d{5}\b', hero_summary_raw):
            candidate=f"{damaged[:2]}:{damaged[-2:]}"
            mm,ss=(int(v) for v in candidate.split(':'))
            if damaged[2]=='1' and ss<60 and mm*60+ss<=45*60:
                play_time=candidate
                break
    if play_time is None and metric_cards:
        summary_primary=str(metric_cards[0].get('primary_value') or '')
        if re.fullmatch(r'\d{1,2}:\d{2}',summary_primary):
            mm,ss=(int(v) for v in summary_primary.split(':'))
            if mm*60+ss<=45*60:
                play_time=summary_primary
    if play_time is None:
        panel_times=re.findall(r'\b\d{1,2}:\d{2}\b',panel_text)
        if panel_times:
            def _mmss_seconds(value):
                mm,ss=value.split(':',1)
                return int(mm)*60+int(ss)
            plausible=[v for v in panel_times if _mmss_seconds(v)<=45*60]
            if plausible:
                play_time=max(plausible,key=_mmss_seconds)

    # Recover obviously clipped integer totals from the visible per-10 helper.
    if play_time:
        mm,ss=(int(v) for v in play_time.split(':'))
        played=mm*60+ss
        for card,metric in zip(metric_cards[1:],metrics):
            value=str(metric.get('value') or '')
            m=re.search(r'10분당\s*평균\s*[:：]?\s*([\d,]+(?:\.\d+)?)',card.get('raw_text') or '')
            if not (played and m and re.fullmatch(r'\d+',value)):
                continue
            avg=float(m.group(1).replace(',',''))
            expected=int(round(avg*played/600))
            if value=='10' and expected<=3:
                metric['value']=str(expected)
                card['primary_value']=str(expected)
            elif value.startswith('0') and expected>=100:
                suffix=int(value)
                base=10**len(value)
                candidate=max(1,round((expected-suffix)/base))*base+suffix
                if abs(candidate-expected)<=max(5,expected*0.02):
                    metric['value']=f"{candidate:,}"
                    card['primary_value']=f"{candidate:,}"

    # Final cleanup for obvious integer OCR artifacts after per-10 recovery.
    for card,metric in zip(metric_cards[1:],metrics):
        value=str(metric.get('value') or '')
        if re.fullmatch(r'0+\d*',value):
            metric['value']=str(int(value))
            card['primary_value']=metric['value']
        if metric.get('metric_key')=='drill_dash_kills' and re.fullmatch(r'\d{7,}',value):
            label=str(metric.get('label_raw') or '')
            m=re.search(r'(\d+)0{6}',label)
            if m:
                metric['value']=m.group(1)
                card['primary_value']=m.group(1)

    known={}
    m=re.search(r'(\d{1,3})%[^\n]*\n?[^\n]*무기\s*명중률|무기\s*명중률[^\n]*(\d{1,3})%',panel_text)
    if m:known['weapon_accuracy']=(m.group(1) or m.group(2))+'%'
    m=re.search(r'(\d{1,3})%[^\n]*\n?[^\n]*치명타\s*(?:명중률|적중률)|치명타\s*(?:명중률|적중률)[^\n]*(\d{1,3})%',panel_text)
    if m:known['critical_hit_accuracy']=(m.group(1) or m.group(2))+'%'
    m=re.search(r'10분당\s*평균\s*[:：]?\s*(\d+(?:\.\d+)?)',panel_text)
    if m:known['per_10_min_average']=m.group(1)

    return {
        'screen_type':'personal',
        'ocr_version':'0.10.28-dev',
        'hero_key':hero_key,
        'hero_name_raw':hero_name_raw,
        'hero_summary_raw':hero_summary_raw,
        'hero_metric_inference':hero_metric_inference,
        'play_time':play_time,
        'known_metrics':known,
        'metrics':metrics,
        'layout_detection':layout,
        'metric_cards':metric_cards,
        'raw_text':panel_text,
    }

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
