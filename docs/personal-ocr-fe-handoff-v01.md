# ORCA Personal OCR FE Handoff Contract v0.1

This document is the current BE/DB contract for FE work on `be-dev`.
FE should consume this structure rather than redesigning Personal OCR storage.

## 1. Personal OCR response

Important fields:

```json
{
  "hero_key": "ana",
  "play_time": "05:11",
  "metrics": [
    {
      "metric_key": "sleep_dart_accuracy",
      "scope": "hero_specific",
      "label_raw": "수면총 명중률",
      "value": "86%",
      "confidence": 0.72,
      "needs_review": false
    }
  ]
}
```

- `hero_key`: stable internal English hero key.
- `metric_key`: stable DB/analysis key. FE must not rename it.
- `label_raw`: OCR/debug label; do not use it as the DB key.
- `scope`: currently `common` or `hero_specific`.
- Hero-specific metric count is variable. Do not hard-code a fixed number of inputs.

## 2. Team OCR hero fields

```json
{
  "hero_key": "reinhardt",
  "hero_id": "라인하르트"
}
```

- `hero_key`: internal key.
- `hero_id`: Korean display name.

## 3. FE review model to send on confirm

Each item in `ConfirmMatchInput.my_hero_details` should support:

```json
{
  "hero": "아나",
  "hero_key": "ana",
  "play_time": "05:11",
  "accuracy": "",
  "critical": "",
  "hero_specific": {
    "biotic_grenade_kills": "3",
    "healing_amplified": "207",
    "players_saved": "4",
    "enemies_slept": "6",
    "healing_prevented": "979",
    "scoped_accuracy": "73%",
    "sleep_dart_accuracy": "86%",
    "nano_boost_assists": "2"
  }
}
```

The Personal review UI should render the OCR `metrics[]` dynamically and let the user edit the values while retaining each `metric_key`.

## 4. Supabase storage

`public.my_hero_details`:

- `hero_id`: display hero name supplied by FE.
- `hero_key`: stable English key.
- `play_time`: reviewed play time.
- `accuracy`: reviewed common weapon accuracy when applicable.
- `crit_rate`: reviewed critical-hit rate when applicable.
- `hero_specific`: JSON object in `{ metric_key: value }` form.

Do not add one SQL column per hero-specific metric.

## 5. Confirm precedence

`confirm_orca_match` uses this precedence:

1. FE-reviewed values in `p_my_hero_details`.
2. Personal OCR saved in `uploads.ocr_raw` as fallback.
3. Legacy `custom_label/custom_value` is temporarily accepted for migration compatibility.

For `hero_specific`, OCR metrics are merged first and FE-reviewed keys overwrite them. Therefore a reviewed value always wins for the same `metric_key`.

If an older FE sends an empty `p_my_hero_details` array, the RPC still saves available Personal OCR data as a backward-safe fallback.

## 6. Current verified Personal OCR heroes

Image-tested on BE:

- Roadhog
- Symmetra
- Ana

More heroes will be added by expanding the BE metric dictionary without changing this FE contract.

## 7. Current FE migration note

The existing FE Personal mapping only populates `play_time` and `weapon_accuracy`. It should be migrated to the dynamic `metrics[]` model above.

Do not change the BE metric keys, Team hero field meanings, or Supabase `hero_specific` format while doing the FE migration.
