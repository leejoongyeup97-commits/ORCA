# ORCA Hero References

이 폴더는 Team OCR의 영웅 초상화 판별에 필요한 **production runtime asset** 폴더입니다.

필수 구성:

- `manifest.json`
- 영웅별 하위 폴더
- 각 영웅 폴더 안의 reference 이미지(`.png/.jpg/.jpeg/.webp`)

예:

```text
hero_references/
  manifest.json
  kiriko/
    sample_1.png
  reinhardt/
    sample_1.png
```

이 폴더는 더 이상 `.gitignore` 대상이 아닙니다.
검증된 production reference를 생성한 뒤 이 폴더 전체를 Git에 커밋해야 다른 개발자도 동일한 Team 영웅 인식을 사용할 수 있습니다.

로컬 benchmark 원본이 준비되어 있다면:

```text
be/BUILD_HERO_REFERENCES.bat
```

으로 재생성할 수 있습니다.
