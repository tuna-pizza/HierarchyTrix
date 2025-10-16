import { NodeType, Node, Edge, HierarchicallyClusteredGraph } from "./graph.js";
import { hsvToRgb } from "./utils.js";

const svgNS = "http://www.w3.org/2000/svg";
const cellSize = 40;
const nodeColor = "black";
const cellboundaryColor = "darkgray";
const treecolor = "lightgray";
const edgeColor = "rgb(50, 125, 200)";
const arrayBoundaryWidth = "3";
const edgeWidth = "4";
const textSize = "20";
const smallTextSize = "12";
const textOffset = 2;
const vertexDistance = 80;
const clusterDistanceScalar = 1.5;

export class HierarchicallyClusteredGraphDrawer {
  constructor(H) {
    this.H = H;
    this.nodeOrder = null;
  }
  addOrderConstraints(orderString) {
    //TODO: Include output from Annika and Marialena
    this.nodeOrder = [];
    let idOrder = orderString.split(" ");
    for (let i = 0; i < idOrder.length; i++) {
      this.nodeOrder.push(this.H.getNodeByID(idOrder[i]));
    }
  }
  drawSquare(x, y) {
    const square = document.createElementNS(svgNS, "polygon");
    square.setAttribute(
      "points",
      "" +
        (x - cellSize / 2) +
        "," +
        y +
        " " +
        x +
        "," +
        (y + cellSize / 2) +
        " " +
        (x + cellSize / 2) +
        "," +
        y +
        " " +
        x +
        "," +
        (y - cellSize / 2)
    );
    //square.setAttribute("transform", "rotate(-45 " + cellSize/2 + " " + cellSize/2 + ")");
    square.setAttribute("x", x); // top-left corner
    square.setAttribute("y", y);
    square.setAttribute("stroke", cellboundaryColor);
    square.setAttribute("stroke-width", arrayBoundaryWidth);
    return square;
  }
  defineSquareShape(svg, defs) {
    const square = document.createElementNS(svgNS, "polygon");
    square.setAttribute("id", "squareShape");
    square.setAttribute(
      "points",
      `${-cellSize / 2},0 0,${cellSize / 2} ${cellSize / 2},0 0,${
        -cellSize / 2
      }`
    );
    square.setAttribute("stroke", cellboundaryColor);
    square.setAttribute("stroke-width", arrayBoundaryWidth);
    defs.appendChild(square);
  }
  drawNode(id, x, y, svg) {
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", x); // x position
    label.setAttribute("y", y + textOffset); // y position
    label.setAttribute("fill", "white"); // text color
    label.setAttribute("font-size", textSize);
    label.setAttribute("text-anchor", "middle"); // center horizontally
    label.setAttribute("alignment-baseline", "middle"); // center vertically
    label.textContent = id;
    //let square = this.drawSquare(x,y);
    //square.setAttribute("fill", nodeColor);
    let square = document.createElementNS(svgNS, "use");
    square.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "href",
      "#squareShape"
    );
    square.setAttribute("x", x);
    square.setAttribute("y", y);
    square.setAttribute("fill", nodeColor);
    svg.appendChild(square);
    svg.appendChild(label);
  }
  drawCluster(
    cluster,
    offsetX,
    offsetY,
    svg,
    xCoordMap,
    yCoordMap,
    widthMap,
    xCoordReferenceMap,
    yCoordReferenceMap
  ) {
    let numberOfChildren = cluster.getChildren().length;
    let x = offsetX - (cluster.getChildren().length - 1) * 0.5 * cellSize;
    xCoordMap.set(cluster, offsetX);
    yCoordMap.set(cluster, offsetY);
    widthMap.set(cluster, numberOfChildren * cellSize);
    let children = [];
    let unsortedChildren = cluster.getChildren();
    while (unsortedChildren.length > 0) {
      let nextChild = unsortedChildren.at(0);
      let lowestX = xCoordMap.get(nextChild);
      for (let i = 1; i < unsortedChildren.length; i++) {
        let potentialChild = unsortedChildren.at(i);
        let potentialX = xCoordMap.get(potentialChild);
        if (potentialX < lowestX) {
          lowestX = potentialX;
          nextChild = potentialChild;
        }
      }
      children.push(nextChild);
      unsortedChildren = unsortedChildren.filter(
        (child) => child !== nextChild
      );
    }
    for (let child of children) {
      this.drawNode(child.id, x, offsetY, svg);
      xCoordReferenceMap.set(child, x);
      yCoordReferenceMap.set(child, offsetY);
      x = x + cellSize;
    }
    for (let child1 of cluster.getChildren()) {
      for (let child2 of cluster.getChildren()) {
        let x1 = xCoordReferenceMap.get(child1);
        let x2 = xCoordReferenceMap.get(child2);
        if (x1 < x2) {
          let potentialEdges =
            child1.getLeaves().length * child2.getLeaves().length;
          let actualEdges = this.H.getNumberOfEdges(child1, child2);
          let xDist = x2 - x1;
          this.drawClusterEdge(
            actualEdges,
            potentialEdges,
            x1 + xDist / 2,
            offsetY - xDist / 2,
            svg
          );
        }
      }
    }
  }
  drawClusterEdge(actualEdges, potentialEdges, x, y, svg) {
    let connectivity = actualEdges / potentialEdges;
    //let square = this.drawSquare(x,y);
    let square = document.createElementNS(svgNS, "use");
    square.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "href",
      "#squareShape"
    );
    square.setAttribute("x", x);
    square.setAttribute("y", y);
    let mapValue = connectivity * 0.4;
    let [r, g, b] = hsvToRgb(175, 0.7, 0.95 - mapValue);
    if (connectivity === 0) {
      r = 255;
      g = 255;
      b = 255;
    }
    square.setAttribute("fill", "rgb(" + r + "," + g + "," + b + ")");
    svg.appendChild(square);
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", x); // x position
    label.setAttribute("y", y + textOffset); // y position
    label.setAttribute("fill", "white"); // text color
    label.setAttribute("font-size", smallTextSize);
    label.setAttribute("text-anchor", "middle"); // center horizontally
    label.setAttribute("alignment-baseline", "middle"); // center vertically
    label.textContent = "" + actualEdges + "/" + potentialEdges;
    svg.appendChild(label);
  }
  drawLinearLayout(offsetX, offsetY, svg, xCoordMap, yCoordMap, widthMap) {
    const nodes = document.createElementNS(svgNS, "g");
    if (this.nodeOrder === null) {
      this.nodeOrder = [];
      for (let vertex of this.H.getVertices()) {
        this.nodeOrder.push(vertex);
      }
    }
    for (let vertex of this.nodeOrder) {
      this.drawNode(vertex.id, offsetX, offsetY, nodes);
      xCoordMap.set(vertex, offsetX);
      yCoordMap.set(vertex, offsetY);
      widthMap.set(vertex, cellSize);
      offsetX += vertexDistance;
    }
    for (let edge of this.H.getEdges()) {
      let x1 = xCoordMap.get(edge.getSource());
      let x2 = xCoordMap.get(edge.getTarget());
      if (x1 > x2) {
        let swap = x1;
        x1 = x2;
        x2 = swap;
      }
      let path = this.drawEdge(x1, x2, offsetY, svg);
      svg.appendChild(path);
    }
    svg.appendChild(nodes);
  }
  drawClusterInclusions(
    svg,
    xCoordMap,
    yCoordMap,
    widthMap,
    xCoordReferenceMap,
    yCoordReferenceMap,
    clusterDistance
  ) {
    for (let node of this.H.getNodes()) {
      if (node.getParent() !== null) {
        const referenceX = xCoordReferenceMap.get(node);
        const referenceY = yCoordReferenceMap.get(node);
        const topLeftX =
          referenceX - cellSize / 2 - parseInt(arrayBoundaryWidth, 10);
        const topRightX =
          referenceX + cellSize / 2 + parseInt(arrayBoundaryWidth, 10);
        const upperMiddleLeftX =
          referenceX - cellSize / 2 + 2.5 * parseInt(arrayBoundaryWidth, 10);
        const upperMiddleRightX =
          referenceX + cellSize / 2 - 2.5 * parseInt(arrayBoundaryWidth, 10);
        const topY = referenceY;
        const x = xCoordMap.get(node);
        const y = yCoordMap.get(node);
        const width = widthMap.get(node);
        const bottomLeftX = x - width / 2 - parseInt(arrayBoundaryWidth, 10);
        const bottomRightX = x + width / 2 + parseInt(arrayBoundaryWidth, 10);
        const lowerMiddleLeftX = x - width / 3;
        const lowerMiddleRightX = x + width / 3;
        const bottomY = y;
        const belowTopY = topY + 0.4 * clusterDistance;
        const aboveBottomY = bottomY - 0.6 * clusterDistance;
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute(
          "d",
          `M ${topLeftX} ${topY} ` + // Move to P0
            `C ${upperMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${bottomLeftX} ${bottomY} ` + // Bezier to P1
            `L ${bottomRightX} ${bottomY} ` + // Line to P2
            `C ${lowerMiddleRightX} ${aboveBottomY}, ${upperMiddleRightX} ${belowTopY}, ${topRightX} ${topY} ` + // Bezier to P3
            `L ${topLeftX} ${topY} Z` // Line back to P0 and close
        );

        path.setAttribute("stroke", "none");
        path.setAttribute("fill", treecolor);
        svg.appendChild(path);
      }
    }
  }
  drawEdge(x1, x2, y, svg) {
    const path = document.createElementNS(svgNS, "path");
    let xDist = x2 - x1;
    // Start at (50,150), end at (350,150), control points (150,50) and (250,250)
    path.setAttribute(
      "d",
      "M " +
        x1 +
        " " +
        y +
        " C " +
        x1 +
        " " +
        (y + xDist / 2) +
        ", " +
        x2 +
        " " +
        (y + xDist / 2) +
        ", " +
        x2 +
        "  " +
        y
    );

    // Style
    path.setAttribute("stroke", edgeColor);
    path.setAttribute("stroke-width", edgeWidth);
    path.setAttribute("fill", "none");
    return path;
  }
  draw() {
    const svg = document.createElementNS(svgNS, "svg");
    const defs = document.createElementNS(svgNS, "defs");
    this.defineSquareShape(svg, defs);
    svg.appendChild(defs);
    svg.setAttribute("viewBox", "0 0 1920 1080");
    svg.setAttribute("width", "1920");
    svg.setAttribute("height", "1080");
    let clusterLayers = this.H.getClusterLayers();
    let depth = clusterLayers.length;
    let clusterHeight = this.H.getMaxChildren() * cellSize;
    let clusterDistance = clusterHeight * clusterDistanceScalar;
    let offsetX = cellSize / 2;
    let offsetY = clusterHeight;
    let xCoordMap = new Map();
    let yCoordMap = new Map();
    let widthMap = new Map();
    let xCoordReferenceMap = new Map();
    let yCoordReferenceMap = new Map();
    const linearLayoutGroup = document.createElementNS(svgNS, "g");
    this.drawLinearLayout(
      offsetX,
      offsetY + depth * clusterDistance,
      linearLayoutGroup,
      xCoordMap,
      yCoordMap,
      widthMap
    );
    const clusterGroup = document.createElementNS(svgNS, "g");
    for (let i = depth - 1; i >= 0; i--) {
      for (let cluster of clusterLayers.at(i)) {
        let x = 0;
        for (let child of cluster.getChildren()) {
          x = x + xCoordMap.get(child);
        }
        x = x / cluster.getChildren().length;
        xCoordMap.set(cluster, x);
        this.drawCluster(
          cluster,
          x,
          offsetY + i * clusterDistance,
          clusterGroup,
          xCoordMap,
          yCoordMap,
          widthMap,
          xCoordReferenceMap,
          yCoordReferenceMap
        );
        offsetX = offsetX + cluster.children.length * cellSize + cellSize + 2;
      }
    }
    this.drawClusterInclusions(
      svg,
      xCoordMap,
      yCoordMap,
      widthMap,
      xCoordReferenceMap,
      yCoordReferenceMap,
      clusterDistance
    );
    svg.appendChild(linearLayoutGroup);
    svg.appendChild(clusterGroup);
    document.body.appendChild(svg);
  }
}
