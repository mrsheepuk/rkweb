import type { ReactElement } from "react";
import type { Color, Tile } from "../game/types";

// Each suit carries a distinct *shape* as well as a colour, so the suit is
// never communicated by colour alone — critical for colour-blind players. The
// shape shows as a corner "pip"; greyscale or any CVD type still distinguishes
// suits by shape + lightness.
//
// Pips are drawn as SVG, not Unicode glyphs (●▲◆■): glyph metrics vary wildly
// between fonts/platforms, so the suits rendered at visibly different sizes.
// Each shape below is area-matched (~98 sq units in a 16×16 box) so they look
// equally weighty — bounding-box matching would make the triangle/diamond
// read as smaller. Fill is currentColor, so the per-suit colour rules apply.
const SUIT_PIP: Record<Color, ReactElement> = {
  blue: <circle cx="8" cy="8" r="5.6" />,
  red: <path d="M8 1 L15 15 L1 15 Z" />,
  orange: <path d="M8 1 L15 8 L8 15 L1 8 Z" />,
  black: <rect x="3.05" y="3.05" width="9.9" height="9.9" />,
};

export function TileView({ tile, dragging }: { tile: Tile; dragging?: boolean }) {
  if (tile.kind === "joker") {
    return (
      <div
        className={`tile tile-joker${dragging ? " tile-dragging" : ""}`}
        data-tile-id={tile.id}
        aria-label="joker"
      >
        <span className="tile-face">★</span>
      </div>
    );
  }
  return (
    <div
      className={`tile tile-${tile.color}${dragging ? " tile-dragging" : ""}`}
      data-tile-id={tile.id}
      data-color={tile.color}
      aria-label={`${tile.color} ${tile.value}`}
    >
      <span className="tile-pip" aria-hidden="true">
        <svg viewBox="0 0 16 16">{SUIT_PIP[tile.color]}</svg>
      </span>
      <span className="tile-face">{tile.value}</span>
    </div>
  );
}
