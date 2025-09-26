import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const inclusionColor = "lightblue"; // Original color from drawer_d3.js (treecolor)
const inclusionHighlightColor = "orange"; // Color for highlighting

export function mouseEntersNodeCell() {
  const nodeCell = d3.select(this);
  const data = nodeCell.datum();

  // 1. Highlight the hovered cell itself
  nodeCell.selectAll("use").attr("fill", "red");

  // 2. Identify all leaf nodes (children) of the hovered node/cluster
  const leafIDs = data.getLeaves().map((n) => n.getID());

  // 3. Highlight the corresponding cells in the linear layout
  d3.select(".linear-nodes")
    .selectAll("g.node-cell")
    .filter((d) => leafIDs.includes(d.getID()))
    .selectAll("use")
    .attr("fill", "red");

  // 4. Highlight the inclusion bands (new logic)
  // Get all descendants (clusters and leaves) including the node itself
  const descendants = [data, ...data.getDescendants()];

  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    // The path data object is bound as { node: <cluster node>, path: <path string> }
    .filter((d) => descendants.includes(d.node))
    .attr("fill", inclusionHighlightColor);
}

export function mouseLeavesNodeCell() {
  const nodeCell = d3.select(this);
  const data = nodeCell.datum();

  // 1. Restore the color of the hovered cell itself
  nodeCell.selectAll("use").attr("fill", "black");

  // 2. Identify all leaf nodes (children) of the node/cluster
  const leafIDs = data.getLeaves().map((n) => n.getID());

  // 3. Restore the color of the corresponding cells in the linear layout
  d3.select(".linear-nodes")
    .selectAll("g.node-cell")
    .filter((d) => leafIDs.includes(d.getID()))
    .selectAll("use")
    .attr("fill", "black");

  // 4. Restore the color of the inclusion bands (new logic)
  const descendants = [data, ...data.getDescendants()];

  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    .filter((d) => descendants.includes(d.node))
    .attr("fill", inclusionColor);
}

export function mouseEntersAdjCell() {
  const data = d3.select(this).datum();
  // Change the cell color to red
  d3.select(this).selectAll("use").attr("fill", "red");

  // Get the set of leaf nodes for the source and target clusters
  const sourceLeaves = new Set(data.source.getLeaves().map((n) => n.getID()));
  const targetLeaves = new Set(data.target.getLeaves().map((n) => n.getID()));

  // Select all edges in the linear layout and filter them
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .filter((d) => {
      const dSourceID = d.getSource().getID();
      const dTargetID = d.getTarget().getID();

      // Check if one end of the edge is in the source cluster's leaves
      // AND the other end is in the target cluster's leaves
      return (
        (sourceLeaves.has(dSourceID) && targetLeaves.has(dTargetID)) ||
        (sourceLeaves.has(dTargetID) && targetLeaves.has(dSourceID))
      );
    })
    .attr("stroke", "red") // Change edge color to red
    .attr("stroke-width", "8"); // Make the edge thicker for emphasis
}

export function mouseLeavesAdjCell() {
  const data = d3.select(this).datum();
  // Restore the cell color
  d3.select(this).selectAll("use").attr("fill", data.color);

  // Get the set of leaf nodes for the source and target clusters
  const sourceLeaves = new Set(data.source.getLeaves().map((n) => n.getID()));
  const targetLeaves = new Set(data.target.getLeaves().map((n) => n.getID()));

  // Restore the original edge color and width for the filtered edges
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .filter((d) => {
      const dSourceID = d.getSource().getID();
      const dTargetID = d.getTarget().getID();

      return (
        (sourceLeaves.has(dSourceID) && targetLeaves.has(dTargetID)) ||
        (sourceLeaves.has(dTargetID) && targetLeaves.has(dSourceID))
      );
    })
    .attr("stroke", "rgb(50, 125, 200)") // Assuming original edgeColor is "rgb(50, 125, 200)"
    .attr("stroke-width", "4"); // Assuming original edgeWidth is "4"
}
