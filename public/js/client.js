import { HierarchicallyClusteredGraph } from "./graph.js";
import { HierarchicallyClusteredGraphDrawer } from "./drawer_d3.js";

const urlParams = new URLSearchParams(window.location.search);
const instanceParam = urlParams.get("instance");
const instance = instanceParam && instanceParam.trim() !== "" ? instanceParam : "sample";

async function getOrder(instance) {
  try {
    // Call the Flask endpoint
    const response = await fetch(`/api/order/${instance}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Access the order string
    const orderString = data.order;
    return orderString;
  } catch (err) {
    console.error("Failed to fetch order:", err);
    return null;
  }
}

async function main() {
  let H = new HierarchicallyClusteredGraph();
  await H.readFromJSON(instance); // wait for JSON to load
  let HD = new HierarchicallyClusteredGraphDrawer(H);
  //let order = "5 8 7 6 4 9 2 3 1";
  let order = await getOrder(instance);
  if (order) {
     HD.addOrderConstraints(order); // set node order
  }
  HD.draw(); // now nodes are loaded, getClusters() will return the correct clusters
}

main();
