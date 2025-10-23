import { HierarchicallyClusteredGraph } from "./graph.js";
import { HierarchicallyClusteredGraphDrawer } from "./drawer_d3.js";

// --- Get URL parameters ---
const urlParams = new URLSearchParams(window.location.search);
const instanceParam = urlParams.get("instance");
const instance = instanceParam && instanceParam.trim() !== "" ? instanceParam : "sample";

// ✅ Get solver type from URL
const solverParam = urlParams.get("method");
let solver = "ilp"; // default

if (solverParam) {
    const paramLower = solverParam.toLowerCase();
    if (paramLower === "heuristic" || paramLower === "hybrid") {
        solver = paramLower;
    }
}

console.log("🧩 Using solver:", solver);

// --- Fetch order from server ---
async function getOrder(instance, solver = "ilp") {
  try {
    const response = await fetch(`/api/order/${instance}?method=${solver}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.order;
  } catch (err) {
    console.error("❌ Failed to fetch order:", err);
    return null;
  }
}

// --- Upload handler ---
async function uploadGraph(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    showSuccessModal(result.filename.replace(".json", ""));

  } catch (error) {
    console.error('❌ Upload failed:', error);
    alert('Failed to upload graph. Check console for details.');
  }
}

// --- Modal Functions ---
function showSuccessModal(instanceId) {
  const modal = document.getElementById('success-modal');
  const instanceIdInput = document.getElementById('instance-id-input');
  if (instanceIdInput) instanceIdInput.value = instanceId;
  if (modal) modal.style.display = 'flex';
}

function hideSuccessModal() {
  const modal = document.getElementById('success-modal');
  if (modal) modal.style.display = 'none';
}

// --- Apply node order ---
function applyNodeOrder(graph, order) {
  // graph.getNodes() returns all nodes
  // We'll reorder vertices based on server order
  if (!order || order.length === 0) return;

  const nodeMap = new Map();
  for (const node of graph.getNodes()) {
    nodeMap.set(node.getID(), node);
  }

  const newOrder = [];
  for (const id of order) {
    if (nodeMap.has(id)) newOrder.push(nodeMap.get(id));
  }

  // Append any nodes not in order at the end
  for (const node of graph.getNodes()) {
    if (!newOrder.includes(node)) newOrder.push(node);
  }

  // Replace nodes array
  graph.nodes = newOrder;
}

// --- Main function ---
async function main() {
  // Check if a solver request is being made on initial load.
  const isInitialLoad = new URLSearchParams(window.location.search).get("instance");
  
  // Show loading modal immediately if an instance is being loaded/solved
  if (isInitialLoad && typeof window.showLoadingModal === 'function') {
      window.showLoadingModal();
  }
  
  // 1. Initialize Graph
  let H = new HierarchicallyClusteredGraph();
  await H.readFromJSON(instance);

  // 2. Get Order from Server
  const orderString = await getOrder(instance, solver);
  if (orderString) {
    const orderList = Array.isArray(orderString) ? orderString : orderString.trim().split(/\s+/);
    console.log("✅ Applying order:", orderList);
    applyNodeOrder(H, orderList); // <-- fixed
  } else {
    console.warn("⚠️ No order received from server.");
  }

  // 3. Initialize Drawer
  let HD = new HierarchicallyClusteredGraphDrawer(H);
  HD.draw('#graph-container');

  // Hide the loading modal once the visualization is drawn
  if (isInitialLoad && typeof window.hideLoadingModal === 'function') {
      window.hideLoadingModal();
  }

  // Zoom functionality
  window.addEventListener('zoomOut', () => {
    if (HD && typeof HD.zoomOut === 'function') {
      HD.zoomOut();
    } else {
      console.warn('Zoom out not implemented in drawer');
    }
  });

  window.addEventListener('zoomReset', () => {
    if (HD && typeof HD.zoomReset === 'function') {
      HD.zoomReset();
    } else {
      console.warn('Zoom reset not implemented in drawer');
    }
  });

  window.addEventListener('zoomIn', () => {
    if (HD && typeof HD.zoomIn === 'function') {
      HD.zoomIn();
    } else {
      console.warn('Zoom in not implemented in drawer');
    }
  });

  // 4. Update UI
  const idElement = document.getElementById('current-instance-id');
  if (idElement) idElement.textContent = instance;

  // 5. Setup Event Listeners
  const fileInput = document.getElementById('file-upload');
  if (fileInput) fileInput.addEventListener('change', e => uploadGraph(e.target.files[0]));

  const stayButton = document.getElementById('stay-button');
  if (stayButton) stayButton.addEventListener('click', hideSuccessModal);

  const themeButton = document.getElementById('theme-toggle-button');
  if (themeButton) themeButton.addEventListener('click', () => document.body.classList.toggle('k00l90z-mode'));

  setupGoButtonListener();
}

// --- Go Button Handler ---
function setupGoButtonListener() {
  const goButton = document.getElementById('go-button');
  const instanceIdInput = document.getElementById('instance-id-input');
  const solverSelect = document.getElementById('solver-select');

  if (goButton && instanceIdInput && solverSelect) {
    goButton.addEventListener('click', () => {
      const newInstanceId = instanceIdInput.value;
      const selectedSolver = solverSelect.value;
      
      if (newInstanceId) {
        // VITAL CHANGE: Show loading modal before navigation
        if (typeof window.showLoadingModal === 'function') {
           window.showLoadingModal();
        }

        const url = new URL(window.location.href);
        url.searchParams.set('instance', newInstanceId);
        url.searchParams.set('method', selectedSolver);
        
        // This triggers the page reload/solve.
        window.location.href = url.toString(); 
      } else {
        console.error("Missing instance ID, cannot navigate.");
        // If there's an error, hide the success modal (and loading modal if it somehow showed)
        hideSuccessModal();
        if (typeof window.hideLoadingModal === 'function') {
           window.hideLoadingModal();
        }
      }
    });
  } else {
    console.error("Missing elements for Go Button setup.");
  }
}

// --- Run main ---
document.addEventListener('DOMContentLoaded', main);