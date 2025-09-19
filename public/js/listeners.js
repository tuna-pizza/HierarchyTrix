import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function mouseEntersNodeCell() {
  d3.select(this).selectAll("use").attr("fill", "red");
}

export function mouseLeavesNodeCell() {
  d3.select(this).selectAll("use").attr("fill", "black");
}
