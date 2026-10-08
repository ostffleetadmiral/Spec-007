#!/usr/bin/env python3
"""SPEC-007 dossier site builder.

Renders the public markdown documents into the fleet-dossier layout.
Static output lands in this directory; HTML comments in the sources are
preserved verbatim — the covert layer survives view-source.

Usage:  python3 build.py        (from this directory)
"""

import html
import pathlib
import re
import sys

import markdown

ROOT = pathlib.Path(__file__).resolve().parent
DOCS = ROOT.parent  # experiments/Spec-007/
DOC_EN = DOCS / "docs" / "en"
DOC_ZH = DOCS / "docs" / "zh-Hant"

# (source path, output slug, page title, authority level, lang)
MANIFEST = [
    ("cover.md", "cover.html", "Dossier Index", "COVER", "en"),
    ("cover.zh-Hant.md", "cover-zh.html", "檔案索引", "COVER", "zh"),
    ("charter.md", "charter.html", "The Charter Beneath", "CHARTER", "en"),
    ("charter.zh-Hant.md", "charter-zh.html", "底層憲章", "CHARTER", "zh"),
    ("ledger.md", "ledger.html", "Ledger of Fractions", "Q BRANCH", "en"),
    ("ledger.zh-Hant.md", "ledger-zh.html", "分數帳本", "Q BRANCH", "zh"),
    (DOC_EN / "spec-007-public.en.md", "public.html", "The Briefing", "L0", "en"),
    (DOC_ZH / "spec-007-public.zh-Hant.md", "public-zh.html", "簡報", "L0", "zh"),
    (DOC_EN / "spec-007.en.md", "covert-en.html", "Covert Copy — English", "L0", "en"),
    (DOC_ZH / "spec-007.zh-Hant.md", "covert-zh.html", "Covert Copy — 繁體中文", "L0", "zh"),
    (DOC_EN / "spec-007-terminology.md", "terminology.html", "Terminology", "L0", "en"),
    (DOC_ZH / "spec-007-terminology.zh-Hant.md", "terminology-zh.html", "術語表", "L0", "zh"),
    (DOC_EN / "spec-007-verified.en.md", "verified.html", "The Trusted Numbers", "L1", "en"),
    (DOC_ZH / "spec-007-verified.zh-Hant.md", "verified-zh.html", "可信數字", "L1", "zh"),
    (DOC_EN / "spec-007-research-dossier.md", "dossier.html", "The File on the Asset", "L2", "en"),
    (DOC_ZH / "spec-007-research-dossier.zh-Hant.md", "dossier-zh.html", "資產檔案", "L2", "zh"),
    (DOC_EN / "spec-007-claim-verification.en.md", "claims.html", "Interrogation Record", "L2", "en"),
    (DOC_ZH / "spec-007-claim-verification.zh-Hant.md", "claims-zh.html", "審訊記錄", "L2", "zh"),
    (DOC_EN / "spec-007-design-input-audit.en.md", "input-audit.html", "Design-Input Audit", "L2", "en"),
    (DOC_ZH / "spec-007-design-input-audit.zh-Hant.md", "input-audit-zh.html", "設計輸入審計", "L2", "zh"),
    (DOC_EN / "spec-007-registry.en.md", "registry.html", "SPEC Registry", "L2", "en"),
    (DOC_ZH / "spec-007-registry.zh-Hant.md", "registry-zh.html", "SPEC 登錄表", "L2", "zh"),
    (DOC_EN / "spec-007-proposal-record.en.md", "proposal-record.html", "Proposal Record", "L2", "en"),
    (DOC_ZH / "spec-007-proposal-record.zh-Hant.md", "proposal-record-zh.html", "提案紀錄", "L2", "zh"),
    (DOC_EN / "spec-007-economic-assessment.en.md", "economics.html", "The Ledger", "L3", "en"),
    (DOC_ZH / "spec-007-economic-assessment.zh-Hant.md", "economics-zh.html", "帳本", "L3", "zh"),
    (DOC_EN / "spec-007-engineering-revision.en.md", "red-team.html", "The Red Team", "L3", "en"),
    (DOC_ZH / "spec-007-engineering-revision.zh-Hant.md", "red-team-zh.html", "紅隊", "L3", "zh"),
    (DOC_EN / "spec-007-expanded-engineering-spec.en.md", "expanded.html", "The Expanded Design", "L3", "en"),
    (DOC_ZH / "spec-007-expanded-engineering-spec.zh-Hant.md", "expanded-zh.html", "擴充設計", "L3", "zh"),
    (DOC_EN / "spec-007-governance-gap-analysis.en.md", "governance.html", "Governance Gap Analysis", "L3", "en"),
    (DOC_ZH / "spec-007-governance-gap-analysis.zh-Hant.md", "governance-zh.html", "治理缺口分析", "L3", "zh"),
    (DOC_EN / "spec-007-component-map.en.md", "component-map.html", "The Component Map", "L2", "en"),
    (DOC_ZH / "spec-007-component-map.zh-Hant.md", "component-map-zh.html", "元件對照表", "L2", "zh"),
    (DOC_EN / "spec-007-protocol.en.md", "protocol.html", "The Protocol", "L3", "en"),
    (DOC_ZH / "spec-007-protocol.zh-Hant.md", "protocol-zh.html", "協定規格", "L3", "zh"),
    (DOC_EN / "spec-007-integration-architecture.en.md", "architecture.html", "Integration Architecture", "L3", "en"),
    (DOC_ZH / "spec-007-integration-architecture.zh-Hant.md", "architecture-zh.html", "整合架構", "L3", "zh"),
    (DOC_EN / "spec-007-discoveries.en.md", "discoveries.html", "The Discovery Ledger", "L2", "en"),
    (DOC_ZH / "spec-007-discoveries.zh-Hant.md", "discoveries-zh.html", "發現帳本", "L2", "zh"),
    ("veracity.md", "veracity.html", "Veracity Audit", "L4", "en"),
    ("veracity.zh-Hant.md", "veracity-zh.html", "真實性稽核", "L4", "zh"),
]

# twin map: en slug ↔ zh slug (covert pair is hand-named)
TWINS = {"covert-en.html": "covert-zh.html", "covert-zh.html": "covert-en.html"}
for _src, _out, _t, _l, _lang in MANIFEST:
    if _lang == "en" and _out != "covert-en.html":
        _zh = _out.replace(".html", "-zh.html")
        if any(o == _zh for _s, o, _tt, _ll, _lg in MANIFEST if _lg == "zh"):
            TWINS[_out] = _zh
            TWINS[_zh] = _out

NAV_EN = [
    ("cover.html", "Dossier Index"),
    ("public.html", "The Briefing"),
    ("verified.html", "Verified"),
    ("dossier.html", "Evidence"),
    ("claims.html", "Claims"),
    ("economics.html", "Economics"),
    ("expanded.html", "Expanded Design"),
    ("ledger.html", "Ledger of Fractions"),
    ("desktop.html", "FANO-1 Workstation"),
    ("charter.html", "The Charter"),
    ("covert-en.html", "Covert EN"),
    ("covert-zh.html", "Covert ZH"),
    ("verdict.html", "Security Adjudication"),
    ("veracity.html", "Veracity Audit"),
    ("discoveries.html", "Discovery Ledger"),
    ("declassified.html", "Declassified"),
    ("object-006.html", "OSTF-006"),
    ("7q.html", "L5 — 7q"),
]

NAV_ZH = [
    ("cover-zh.html", "檔案索引"),
    ("public-zh.html", "簡報"),
    ("verified-zh.html", "已驗證"),
    ("dossier-zh.html", "證據"),
    ("claims-zh.html", "主張"),
    ("economics-zh.html", "經濟"),
    ("expanded-zh.html", "擴充設計"),
    ("ledger-zh.html", "分數帳本"),
    ("desktop.html", "FANO-1 工作站"),
    ("charter-zh.html", "憲章"),
    ("covert-en.html", "密件 EN"),
    ("covert-zh.html", "密件 ZH"),
    ("verdict.html", "安全裁決"),
    ("veracity.html", "真實性稽核"),
    ("discoveries-zh.html", "發現帳本"),
    ("declassified-zh.html", "解密件"),
    ("object-006-zh.html", "OSTF-006"),
    ("7q.html", "L5 — 7q"),
]

LAYOUT = """<!DOCTYPE html>
<html lang="{langattr}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SPEC-007 // {title}</title>
<link rel="stylesheet" href="assets/dossier.css">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
</head>
<body>
<!-- Q Branch issue — certified to half an ulp. Do not leave it in the field. -->
{guardscript}
<div class="dossier">
<div class="watermark">{watermark}</div>
<div class="banner">{banner}</div>
<nav class="file-nav">
{nav}
</nav>
{twinlink}
<main>
{content}
</main>
<footer>
<span>{foot_l}</span>
<span>{foot_r}</span>
</footer>
</div>
</body>
</html>
"""

CHROME = {
    "en": {
        "langattr": "en", "watermark": "PUBLIC&nbsp;RELEASE",
        "banner": "OSTF Fleet Command &middot; SPEC-007 &middot; Public Release &middot; v1.4.0",
        "foot_l": 'SPEC-007 &middot; "Ice Cream Tube" &middot; CC0',
        "foot_r": "Do try to return it in one piece.",
        "nav": NAV_EN, "twin_label": "中文",
    },
    "zh": {
        "langattr": "zh-Hant", "watermark": "公開發布",
        "banner": "OSTF 艦隊司令部 &middot; SPEC-007 &middot; 公開發布 &middot; v1.4.0",
        "foot_l": 'SPEC-007 &middot;「冰淇淋管」&middot; CC0',
        "foot_r": "請務必完整歸還。",
        "nav": NAV_ZH, "twin_label": "EN",
    },
}


def build_nav(current: str, lang: str) -> str:
    parts = []
    for href, label in CHROME[lang]["nav"]:
        if href == current:
            parts.append(f"<strong>[{html.escape(label)}]</strong>")
        else:
            parts.append(f'<a href="{href}">{html.escape(label)}</a>')
    return " &middot;\n".join(parts)


def render(src: pathlib.Path) -> str:
    text = src.read_text(encoding="utf-8")
    # Rewrite .md links to generated .html slugs where they exist.
    slug_map = {src_path.name: out for src_path, out, *_rest in MANIFEST if isinstance(src_path, pathlib.Path)}
    for md_name, html_name in slug_map.items():
        text = text.replace(f"]({md_name})", f"]({html_name})")
    return markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "sane_lists"],
        output_format="html5",
    )


def main() -> int:
    for src, out, title, level, lang in MANIFEST:
        src_path = src if isinstance(src, pathlib.Path) else ROOT / src
        if not src_path.exists():
            print(f"missing source: {src_path}", file=sys.stderr)
            return 1
        content = render(src_path)
        twin = TWINS.get(out)
        other = "en" if lang == "zh" else "zh"
        twinlink = (f'<div class="lang-twin"><a href="{twin}" onclick='
                    f'"try{{localStorage.setItem(\'fano1.lang\',\'{other}\')}}'
                    f'catch(e){{}}">'
                    f'{CHROME[lang]["twin_label"]} ⇄</a></div>') if twin else ""
        guardscript = (
            f"<script>try{{var _l=localStorage.getItem('fano1.lang');"
            f"if(_l&&_l!=='{lang}')window.location.replace('{twin}');"
            f"}}catch(e){{}}</script>"
        ) if twin else ""
        page = LAYOUT.format(
            title=html.escape(title), nav=build_nav(out, lang), content=content,
            twinlink=twinlink, guardscript=guardscript,
            **{k: v for k, v in CHROME[lang].items() if k != "nav"},
        )
        (ROOT / out).write_text(page, encoding="utf-8")
        print(f"  {level:>9}  {out}")
    print("dossier built.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
