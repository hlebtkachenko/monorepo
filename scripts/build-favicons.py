"""
Regenerate the Afframe favicon set for web / admin / api from the single
brand-color source of truth in packages/ui/src/styles/globals.css.

Colors are not hardcoded here. Edit one --brand-* token in globals.css,
rerun this script, commit the regenerated files.

  web + api   adaptive   --brand-primary-light / --brand-primary-dark
  admin       adaptive   --brand-admin-light   / --brand-admin-dark
  (all surfaces transparent ground)

Locked single-color surfaces (apple-touch-icon, PWA manifest icons,
legacy .ico) bake the light token — those formats don't support a
media-query switch.

Requirements:
  - rsvg-convert (brew install librsvg)
  - Pillow (pip install Pillow)
  - The mark vector source. Override path with AFFRAME_BRAND_DIR env var;
    defaults to ~/Developer/afframe-brand.

Usage:
  python3 scripts/build-favicons.py
"""
import os
import re
import subprocess
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.environ.get(
    "AFFRAME_BRAND_DIR",
    os.path.expanduser("~/Developer/afframe-brand"),
)
SRC_SVG = os.path.join(BRAND, "v3/figma/icon_flat.svg")
GLOBALS_CSS = os.path.join(REPO, "packages/ui/src/styles/globals.css")

if not os.path.isfile(SRC_SVG):
    raise SystemExit(
        f"mark vector not found at {SRC_SVG}\n"
        f"set AFFRAME_BRAND_DIR or clone the brand repo to ~/Developer/afframe-brand"
    )
TMP = "/tmp/_afframe_favicon_t.svg"


def css_token(name: str) -> str:
    """Read --<name>: #RRGGBB from packages/ui/src/styles/globals.css.
    globals.css is the single source of truth for brand color values."""
    css = open(GLOBALS_CSS).read()
    m = re.search(rf"--{name}:\s*(#[0-9A-Fa-f]+)", css)
    if not m:
        raise SystemExit(f"missing token --{name} in {GLOBALS_CSS}")
    return m.group(1)


PRIMARY_LIGHT = css_token("brand-primary-light")
PRIMARY_DARK = css_token("brand-primary-dark")
ADMIN_LIGHT = css_token("brand-admin-light")
ADMIN_DARK = css_token("brand-admin-dark")

icon = open(SRC_SVG).read()
ivb = list(map(float, re.search(r'viewBox="([\-\d. ]+)"', icon).group(1).split()))
PATH_D = re.search(r'<path d="([^"]+)"', icon).group(1)


def transparent_svg(size: int, mark: str, frac: float) -> str:
    sc = (size * frac) / ivb[2]
    iw = ivb[2] * sc
    ih = ivb[3] * sc
    tx = (size - iw) / 2 - ivb[0] * sc
    ty = (size - ih) / 2 - ivb[1] * sc
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"'
        f' width="{size}" height="{size}">'
        f'<g transform="translate({tx:.3f},{ty:.3f}) scale({sc:.5f})">'
        f'<path d="{PATH_D}" fill="{mark}"/></g></svg>'
    )


def adaptive_svg(size: int, light: str, dark: str, frac: float) -> str:
    sc = (size * frac) / ivb[2]
    iw = ivb[2] * sc
    ih = ivb[3] * sc
    tx = (size - iw) / 2 - ivb[0] * sc
    ty = (size - ih) / 2 - ivb[1] * sc
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"'
        f' width="{size}" height="{size}">'
        f"<style>.m{{fill:{light}}}"
        f"@media(prefers-color-scheme:dark){{.m{{fill:{dark}}}}}</style>"
        f'<g transform="translate({tx:.3f},{ty:.3f}) scale({sc:.5f})">'
        f'<path class="m" d="{PATH_D}"/></g></svg>'
    )


def render(svg: str, out_path: str, px: int) -> None:
    open(TMP, "w").write(svg)
    subprocess.run(
        ["rsvg-convert", "-w", str(px), "-h", str(px), TMP, "-o", out_path],
        check=True,
    )


def write_web_or_api(app: str, light: str, dark: str, primary: str) -> None:
    """web/api share the dual-theme story. primary = the color used for the
    locked single-color surfaces (apple-touch-icon, PWA manifest icons, .ico)."""
    app_dir = os.path.join(REPO, "apps", app, "app")
    pub_dir = os.path.join(REPO, "apps", app, "public")
    api = app == "api"
    icon_dir = pub_dir if api else app_dir

    # Adaptive SVG — single file, theme flips via prefers-color-scheme.
    svg_name = "favicon.svg" if api else "icon.svg"
    open(os.path.join(icon_dir, svg_name), "w").write(
        adaptive_svg(512, light, dark, frac=0.80)
    )

    # Dual PNG raster set for the tab favicon. Browser picks per
    # prefers-color-scheme via the <link media="..."> attribute.
    for theme, mark in [("light", light), ("dark", dark)]:
        for s in (16, 32, 48):
            render(
                transparent_svg(1000, mark, 0.80),
                os.path.join(pub_dir, f"favicon-{s}-{theme}.png"),
                s,
            )

    # Single-color locked surfaces — apple-touch-icon, PWA, legacy ico.
    apple_name = "apple-touch-icon.png" if api else "apple-icon.png"
    render(transparent_svg(1000, primary, 0.62), os.path.join(icon_dir, apple_name), 180)
    render(transparent_svg(1000, primary, 0.62), os.path.join(pub_dir, "icon-192.png"), 192)
    render(transparent_svg(1000, primary, 0.62), os.path.join(pub_dir, "icon-512.png"), 512)
    render(transparent_svg(1000, primary, 0.50), os.path.join(pub_dir, "maskable-512.png"), 512)

    # .ico bundle from light 48px (legacy Windows fallback). Color matters
    # less here — .ico only renders in Edge < 18 or pinned-tab edge cases.
    Image.open(os.path.join(pub_dir, "favicon-48-light.png")).convert("RGBA").save(
        os.path.join(icon_dir, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)]
    )

    print(f"  {app} done")


def write_admin(light: str, dark: str) -> None:
    app_dir = os.path.join(REPO, "apps", "admin", "app")
    pub_dir = os.path.join(REPO, "apps", "admin", "public")

    # Adaptive SVG kept symmetrical with web/api — emits @media switch even
    # when both tokens are equal so future divergence is a globals.css edit.
    open(os.path.join(app_dir, "icon.svg"), "w").write(
        adaptive_svg(512, light, dark, frac=0.80)
    )

    # Dual PNG raster set keyed by media query, mirroring web/api.
    for theme, mark in [("light", light), ("dark", dark)]:
        for s in (16, 32, 48):
            render(
                transparent_svg(1000, mark, 0.80),
                os.path.join(pub_dir, f"favicon-{s}-{theme}.png"),
                s,
            )

    # Single-color locked surfaces — pick the light value as primary.
    render(transparent_svg(1000, light, 0.62), os.path.join(app_dir, "apple-icon.png"), 180)
    render(transparent_svg(1000, light, 0.62), os.path.join(pub_dir, "icon-192.png"), 192)
    render(transparent_svg(1000, light, 0.62), os.path.join(pub_dir, "icon-512.png"), 512)
    render(transparent_svg(1000, light, 0.50), os.path.join(pub_dir, "maskable-512.png"), 512)

    Image.open(os.path.join(pub_dir, "favicon-48-light.png")).convert("RGBA").save(
        os.path.join(app_dir, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("  admin done")


print("regenerating favicons (transparent ground, adaptive where supported)")
print(f"  primary light={PRIMARY_LIGHT}  dark={PRIMARY_DARK}")
print(f"  admin   light={ADMIN_LIGHT}    dark={ADMIN_DARK}")
write_web_or_api("web", light=PRIMARY_LIGHT, dark=PRIMARY_DARK, primary=PRIMARY_LIGHT)
write_web_or_api("api", light=PRIMARY_LIGHT, dark=PRIMARY_DARK, primary=PRIMARY_LIGHT)
# Admin colorway intentionally identical in light + dark per brand spec.
# The adaptive SVG still emits the @media switch (no-op when both equal)
# so future divergence is a one-line change in globals.css.
write_admin(ADMIN_LIGHT, ADMIN_DARK)

# Clean up single-color rasters left over from previous runs.
# Only the dual-suffixed ones (favicon-{16,32,48}-{light,dark}.png) survive.
for app in ("web", "api", "admin"):
    for s in (16, 32, 48):
        stale = os.path.join(REPO, "apps", app, "public", f"favicon-{s}.png")
        if os.path.exists(stale):
            os.remove(stale)

if os.path.exists(TMP):
    os.remove(TMP)
print("done")
