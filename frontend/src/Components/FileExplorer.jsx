import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tree } from 'primereact/tree';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Panel } from 'primereact/panel';
import { Toast } from 'primereact/toast';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Dialog } from 'primereact/dialog';
import { ScrollPanel } from 'primereact/scrollpanel';
import { Divider } from 'primereact/divider';
import { InputText } from 'primereact/inputtext';
import { Toolbar } from 'primereact/toolbar';
// Import the base URL for API calls from the central socket configuration.
import { API_BASE_URL } from '../socket';

/**
 * DatasetVisualizer Component
 * * An interactive HTML5 Canvas component for rendering spatial data.
 * Features:
 * - Zoom and Pan capabilities.
 * - Optimized rendering for large datasets using bounding box checks.
 * - Dual-layer rendering: Can display a "comparison" layer (background) behind the main content.
 * - Partition Grid Visualization: Can render the spatial index grid from the master file.
 * * * Props:
 * - content: The text content of the main file to render.
 * - fileName: Name of the main file (used to detect format).
 * - comparisonContent: (Optional) Text content of the background/comparison dataset.
 * - comparisonFileName: (Optional) Name of the comparison file.
 * - partitions: (Optional) Array of partition objects { id, minX, minY, maxX, maxY } for grid visualization.
 */
const DatasetVisualizer = ({ content, fileName, comparisonContent, comparisonFileName, partitions }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    
    // --- STATE ---
    const [status, setStatus] = useState('Initializing...');
    const [parsedData, setParsedData] = useState(null); 
    const [parsedComparisonData, setParsedComparisonData] = useState(null); 

    // View transformation state (Zoom Level k, Translation x/y)
    const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });

    /**
     * Parses raw text content into geometric objects (rects, circles, polygons).
     * Supports both CSV (Box/Point) and WKT (Polygon/Point) formats.
     */
    const parseSpatialContent = (text, fname) => {
        const items = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let detectedType = 'Unknown';
        const lowerName = fname ? fname.toLowerCase() : '';

        const updateBounds = (x, y) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        };

        if (!text) return { items, bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 }, type: 'Empty' };

        // --- CSV PARSING ---
        if (lowerName.endsWith('.csv')) {
            const lines = text.trim().split('\n');
            let separator = ',';
            if (lines.length > 0 && lines[0].includes(';')) separator = ';';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const upperLine = line.toUpperCase();
                // Check for WKT inside CSV (common in index partitions)
                if (upperLine.includes('POLYGON') || upperLine.includes('POINT')) {
                    if (upperLine.includes('POLYGON')) {
                        try {
                            const match = line.match(/\(\((.*?)\)\)/);
                            if (match && match[1]) {
                                const coordString = match[1];
                                const points = coordString.split(',').map(pair => {
                                    const [x, y] = pair.trim().split(/\s+/).map(Number);
                                    updateBounds(x, y);
                                    return { x, y };
                                });
                                items.push({ type: 'polygon', points });
                                detectedType = 'Polygons';
                            }
                        } catch (e) { /* Ignore parse errors */ }
                    } else if (upperLine.includes('POINT')) {
                        try {
                            const match = line.match(/\((.*?)\)/);
                            if (match && match[1]) {
                                const [x, y] = match[1].trim().split(/\s+/).map(Number);
                                updateBounds(x, y);
                                items.push({ type: 'circle', x, y });
                                detectedType = 'Points';
                            }
                        } catch (e) { /* Ignore parse errors */ }
                    }
                    continue; 
                }

                const parts = line.split(separator).map(p => parseFloat(p.trim()));
                const nums = parts.filter(n => !isNaN(n));

                if (nums.length >= 4) {
                    const [x1, y1, x2, y2] = nums;
                    items.push({ type: 'rect', x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
                    updateBounds(x1, y1); updateBounds(x2, y2);
                    detectedType = 'Boxes';
                } else if (nums.length >= 2) {
                    const [x, y] = nums;
                    items.push({ type: 'circle', x, y });
                    updateBounds(x, y);
                    detectedType = 'Points';
                }
            }
        } 
        // --- WKT PARSING ---
        else if (lowerName.endsWith('.wkt')) {
            const lines = text.trim().split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('POLYGON')) {
                    try {
                        const match = line.match(/\(\((.*?)\)\)/);
                        if (match && match[1]) {
                            const coordString = match[1];
                            const points = coordString.split(',').map(pair => {
                                const [x, y] = pair.trim().split(/\s+/).map(Number);
                                updateBounds(x, y);
                                return { x, y };
                            });
                            items.push({ type: 'polygon', points });
                            detectedType = 'Polygons';
                        }
                    } catch (e) { console.warn("WKT Parse error", e); }
                } else if (line.includes('POINT')) {
                    try {
                        const match = line.match(/\((.*?)\)/);
                        if (match && match[1]) {
                            const [x, y] = match[1].trim().split(/\s+/).map(Number);
                            updateBounds(x, y);
                            items.push({ type: 'circle', x, y });
                            detectedType = 'Points';
                        }
                    } catch (e) { console.warn("WKT Parse error", e); }
                }
            }
        }
        return { items, bounds: { minX, maxX, minY, maxY }, type: detectedType };
    };

    // --- EFFECT: Parse Data on Content Change ---
    useEffect(() => {
        if (!content) return;
        setStatus('Parsing data...');

        setTimeout(() => {
            // 1. Parse Main Content
            const mainData = parseSpatialContent(content, fileName);
            
            // 2. Parse Comparison Content
            let compData = null;
            let finalBounds = mainData.bounds;

            if (comparisonContent) {
                const compName = comparisonFileName || (fileName.endsWith('.wkt') ? 'file.wkt' : 'file.csv');
                compData = parseSpatialContent(comparisonContent, compName); 
                
                // Expand bounds to include comparison data
                if (compData.items.length > 0) {
                    finalBounds = {
                        minX: Math.min(mainData.bounds.minX, compData.bounds.minX),
                        maxX: Math.max(mainData.bounds.maxX, compData.bounds.maxX),
                        minY: Math.min(mainData.bounds.minY, compData.bounds.minY),
                        maxY: Math.max(mainData.bounds.maxY, compData.bounds.maxY)
                    };
                }
            }
            
            // 3. Expand bounds to include Partition Grid (if available)
            // This ensures that even empty partitions are within the view
            if (partitions && partitions.length > 0) {
                 partitions.forEach(p => {
                    finalBounds.minX = Math.min(finalBounds.minX, p.minX);
                    finalBounds.maxX = Math.max(finalBounds.maxX, p.maxX);
                    finalBounds.minY = Math.min(finalBounds.minY, p.minY);
                    finalBounds.maxY = Math.max(finalBounds.maxY, p.maxY);
                 });
            }

            if (mainData.items.length === 0 && (!compData || compData.items.length === 0) && (!partitions || partitions.length === 0)) {
                setStatus('No valid spatial data found.');
                setParsedData(null);
                setParsedComparisonData(null);
                return;
            }

            setParsedData({ items: mainData.items, bounds: finalBounds, type: mainData.type });
            setParsedComparisonData(compData);
            
            let statusMsg = `Loaded ${mainData.items.length} ${mainData.type}.`;
            if (compData && compData.items.length > 0) statusMsg += ` (Comparison: ${compData.items.length} items)`;
            setStatus(statusMsg);
            
            // Auto-fit view to bounds
            fitToScreen(finalBounds);

        }, 10);
    }, [content, fileName, comparisonContent, comparisonFileName, partitions]); // Added 'partitions' to dependency

    // --- HELPER: Fit View to Bounds ---
    const fitToScreen = (bounds) => {
        if (!containerRef.current || !bounds) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        const padding = 50;

        const dataW = bounds.maxX - bounds.minX || 1;
        const dataH = bounds.maxY - bounds.minY || 1;

        const scaleX = (width - padding * 2) / dataW;
        const scaleY = (height - padding * 2) / dataH;
        const k = Math.min(scaleX, scaleY);

        const tx = (width - dataW * k) / 2 - bounds.minX * k;
        const ty = (height - dataH * k) / 2 - bounds.minY * k;

        setTransform({ k, x: tx, y: ty });
    };

// --- EFFECT: Render Canvas ---
useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parsedData) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = containerRef.current.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;

    // 1. Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const { k, x, y } = transform;
    const { minX, maxX, minY, maxY } = parsedData.bounds;
    
    const toScreenX = (val) => val * k + x;
    const toScreenY = (val) => height - (val * k + y); 

    // 2. Draw Axes (Background layer)
    ctx.save();
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath();
    if (minY <= 0 && maxY >= 0) { const axisY = toScreenY(0); ctx.moveTo(0, axisY); ctx.lineTo(width, axisY); }
    if (minX <= 0 && maxX >= 0) { const axisX = toScreenX(0); ctx.moveTo(axisX, 0); ctx.lineTo(axisX, height); }
    ctx.stroke();
    ctx.restore();

    // 3. Define Helper to Draw Items
    const drawItems = (items, isComparison) => {
         items.forEach(item => {
            if (item.type === 'circle') {
                const cx = toScreenX(item.x);
                const cy = toScreenY(item.y);
                if (cx < -5 || cx > width + 5 || cy < -5 || cy > height + 5) return;
                
                ctx.fillStyle = isComparison ? 'rgba(200, 200, 200, 0.4)' : 'rgba(59, 130, 246, 0.6)'; 
                const size = Math.max(2, Math.min(10, 3 * k));
                ctx.fillRect(cx - size/2, cy - size/2, size, size);

            } else if (item.type === 'rect') {
                const sx = toScreenX(item.x);
                const sy = toScreenY(item.y + item.h); 
                const sw = item.w * k;
                const sh = item.h * k;
                if (sx + sw < 0 || sx > width || sy + sh < 0 || sy > height) return;

                if (isComparison) {
                    ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(sx, sy, sw, sh);
                } else {
                    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
                    ctx.fillRect(sx, sy, sw, sh);
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(sx, sy, sw, sh);
                }

            } else if (item.type === 'polygon') {
                ctx.strokeStyle = isComparison ? '#ccc' : '#10B981'; 
                ctx.fillStyle = isComparison ? 'rgba(220, 220, 220, 0.2)' : 'rgba(16, 185, 129, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                let inView = false;
                item.points.forEach((p, idx) => {
                    const px = toScreenX(p.x);
                    const py = toScreenY(p.y);
                    if (px >= 0 && px <= width && py >= 0 && py <= height) inView = true;
                    if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                if (inView) { ctx.closePath(); ctx.stroke(); ctx.fill(); }
            }
        });
    };

    // 4. Draw Data Layers
    // Draw Comparison Layer First (Background Data)
    if (parsedComparisonData) drawItems(parsedComparisonData.items, true);
    // Draw Main Data (Foreground Data)
    if (parsedData) drawItems(parsedData.items, false);

    // 5. Draw Partition Grid (MOVED HERE - LAST STEP)
    // Drawing this last ensures the grid lines overlay the data points
    ctx.save();
    if (partitions && partitions.length > 0) {
        partitions.forEach(part => {
            const px = toScreenX(part.minX);
            const py = toScreenY(part.maxY); 
            const pw = (part.maxX - part.minX) * k;
            const ph = (part.maxY - part.minY) * k;

            const isMasterView = fileName.toLowerCase().includes('_master') || fileName.toLowerCase().endsWith('.rsgrove');
            const isActivePart = fileName.includes(part.id.replace('.csv', '')); 

            ctx.lineWidth = 1;

            if (isMasterView || isActivePart) {
                ctx.fillStyle = 'rgba(255, 165, 0, 0.15)'; 
                ctx.fillRect(px, py, pw, ph);
                ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)';
            } else {
                ctx.strokeStyle = 'rgba(100, 100, 100, 0.6)'; // Made slightly darker to be visible over grey points
                ctx.fillStyle = 'transparent'; 
            }

            ctx.strokeRect(px, py, pw, ph);

            if (pw > 40 && ph > 20 && (isMasterView || isActivePart)) {
                ctx.fillStyle = '#444'; // Darker text
                ctx.font = 'bold 10px Arial';
                const label = part.id.replace('.csv', '');
                ctx.fillText(label, px + 4, py + 14);
            }
        });
    } else {
        // Fallback: Standard Bounding Box
        ctx.strokeStyle = '#e0e0e0';
        const bLeft = toScreenX(minX); const bRight = toScreenX(maxX);
        const bBottom = toScreenY(minY); const bTop = toScreenY(maxY); 
        ctx.strokeRect(bLeft, bTop, bRight - bLeft, bBottom - bTop);
    }
    ctx.restore();
    
}, [transform, parsedData, parsedComparisonData, partitions, fileName]);

    // --- INTERACTION HANDLERS ---
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const rect = containerRef.current.getBoundingClientRect();
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const worldX = (mouseX - transform.x) / transform.k;
        const worldY = (rect.height - mouseY - transform.y) / transform.k;
        
        const newK = Math.max(0.1, Math.min(1000, transform.k * (1 + delta)));
        const newX = mouseX - worldX * newK;
        const newY = rect.height - mouseY - worldY * newK;
        
        setTransform({ k: newK, x: newX, y: newY });
    }, [transform]);

    const handleMouseDown = (e) => { setIsDragging(true); setLastMouse({ x: e.clientX, y: e.clientY }); };
    const handleMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y - dy })); 
        setLastMouse({ x: e.clientX, y: e.clientY });
    };
    const handleMouseUp = () => setIsDragging(false);

    return (
        <div className="flex flex-col w-full h-full relative">
            <div className="absolute top-2 right-2 z-5 flex gap-2">
                 <Button icon="pi pi-home" className="p-button-rounded p-button-secondary p-button-sm shadow-2" tooltip="Reset View" onClick={() => parsedData && fitToScreen(parsedData.bounds)} />
            </div>
            <div ref={containerRef} className="w-full h-full bg-white overflow-hidden cursor-move relative" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                <canvas ref={canvasRef} className="block" />
            </div>
            <div className="absolute bottom-2 left-2 bg-white-alpha-80 p-1 border-round text-sm text-gray-700 shadow-1">
                {status} | Zoom: {transform.k.toFixed(2)}x
            </div>
        </div>
    );
};

/**
 * FileExplorer Component
 * * Provides a UI to navigate server-side folders, manage files, and preview content.
 */
function FileExplorer({ onFolderSelect, onFileSelect }) {
    // --- STATE MANAGEMENT ---
    const [nodes, setNodes] = useState([]);
    const [files, setFiles] = useState([]);
    const [selectedNodeKey, setSelectedNodeKey] = useState(null);
    const [expandedKeys, setExpandedKeys] = useState({});
    const [loading, setLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    
    // Preview States
    const [isPreviewDialogVisible, setIsPreviewDialogVisible] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [previewComparisonContent, setPreviewComparisonContent] = useState(null);
    const [previewComparisonFileName, setPreviewComparisonFileName] = useState(''); 
    const [previewType, setPreviewType] = useState('text'); 
    const [previewFileName, setPreviewFileName] = useState('');
    // New state to hold partition grid data from the master file
    const [previewPartitions, setPreviewPartitions] = useState([]); 
    
    // Rename Dialog States
    const [isRenameDialogVisible, setIsRenameDialogVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [currentNodeToRename, setCurrentNodeToRename] = useState(null);
    const toast = useRef(null);

    // --- HELPER FUNCTIONS ---
    const formatFileSize = (bytes) => {
        if (bytes === undefined || bytes === null) return '';
        if (bytes < 1024) return `${bytes} Bytes`;
        const kilobytes = bytes / 1024;
        if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
        const megabytes = kilobytes / 1024;
        return `${megabytes.toFixed(1)} MB`;
    };
    const getBaseDirFromPath = (path) => path ? path.split('/')[0] : null;
    const getRelativePath = (path) => path ? path.split('/').slice(1).join('/') : '';
    
    const findNodeByKey = (nodesToSearch, key) => {
        for (let node of nodesToSearch) {
            if (node.key === key) return node;
            if (node.children) {
                const found = findNodeByKey(node.children, key);
                if (found) return found;
            }
        }
        return null;
    };
    
    // --- PARSER FOR MASTER FILE ---
    // Parses the tab-separated .rsgrove file to extract partition boundaries
    const parseMasterContent = (text) => {
        const parts = [];
        if (!text) return parts;
        const lines = text.trim().split('\n');
        
        // Skip header line (index 0) and process data lines
        for(let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if(!line) continue;
            
            // Split by tab (based on .rsgrove format)
            const cols = line.split(/\t+/); 
            
            // Format check: We need the filename (index 1) and the last 4 columns for coords
            if (cols.length >= 13) {
                parts.push({
                    id: cols[1].trim(), // e.g., "part-00000.csv"
                    // Parse the last 4 columns based on the file structure provided:
                    // ... Geometry | xmin | ymin | xmax | ymax
                    minX: parseFloat(cols[9]),
                    minY: parseFloat(cols[10]),
                    maxX: parseFloat(cols[11]),
                    maxY: parseFloat(cols[12])
                });
            }
        }
        return parts;
    };

    // --- API CALLS ---
    const fetchRoots = useCallback(() => {
        setLoading(true);
        fetch(`${API_BASE_URL}/api/explorer/roots`)
            .then(res => res.json())
            .then(data => { setLoading(false); setNodes(data); })
            .catch(error => { setLoading(false); console.error(error); });
    }, []);

    const refreshParentOfNode = async (childKey) => {
        const pathParts = childKey.split('/');
        if (pathParts.length <= 1) { fetchRoots(); return; }
        const parentKey = pathParts.slice(0, -1).join('/');
        let newNodes = JSON.parse(JSON.stringify(nodes));
        const parentNode = findNodeByKey(newNodes, parentKey);
        if (parentNode) {
            const { childFolders } = await loadNodeContent(parentNode);
            parentNode.children = childFolders;
            setNodes(newNodes);
            setExpandedKeys(prevKeys => ({...prevKeys, [parentKey]: true}));
        }
    };
    
    const loadNodeContent = useCallback(async (node) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/explorer/content?path=${node.key}`);
            if (!response.ok) throw new Error("Error loading");
            const content = await response.json();
            const childFolders = content.filter(item => item.type === 'folder');
            const childFiles = content.filter(item => item.type === 'file');
            setFiles(childFiles); setLoading(false);
            return { childFolders, childFiles };
        } catch (error) {
            toast.current.show({ severity: 'error', summary: 'Loading Error', detail: error.message });
            setFiles([]); setLoading(false);
            return { childFolders: [], childFiles: [] };
        }
    }, []);
    
    const updateNodeInChildren = (currentNodes, key, newChildren) => {
        return currentNodes.map(node => {
            if (node.key === key) return { ...node, children: newChildren, leaf: newChildren.length === 0 };
            if (node.children) return { ...node, children: updateNodeInChildren(node.children, key, newChildren) };
            return node;
        });
    };

    const refreshCurrentNodeContent = useCallback(async () => {
        if (!selectedNodeKey) return;
        setLoading(true);
        setNodes(currentNodes => updateNodeInChildren(currentNodes, selectedNodeKey, []));
        await new Promise(resolve => setTimeout(resolve, 0));
        const nodeToRefresh = { key: selectedNodeKey };
        const { childFolders, childFiles } = await loadNodeContent(nodeToRefresh);
        setFiles(childFiles);
        setNodes(currentNodes => updateNodeInChildren(currentNodes, selectedNodeKey, childFolders));
        setExpandedKeys(prevKeys => ({ ...prevKeys, [selectedNodeKey]: true }));
    }, [selectedNodeKey, loadNodeContent]);
    
    useEffect(() => { fetchRoots(); }, [fetchRoots]);

    // --- TREE EVENT HANDLERS ---
    const onSelect = useCallback((event) => {
        const node = event.node;
        if (node.type !== 'folder') return;
        setSelectedNodeKey(node.key); setFiles([]); setSelectedFile(null);
        if (onFileSelect) onFileSelect(null);
        if (onFolderSelect) onFolderSelect(getRelativePath(node.key), getBaseDirFromPath(node.key));
        loadNodeContent(node);
    }, [onFolderSelect, onFileSelect, loadNodeContent]);

    const onExpand = async (event) => {
        const node = event.node;
        if (selectedNodeKey !== node.key) onSelect({ node });
        if ((node.children && node.children.length > 0) || node.leaf) { setExpandedKeys(event.expandedKeys); return; }
        const { childFolders } = await loadNodeContent(node);
        setNodes(currentNodes => updateNodeInChildren(currentNodes, node.key, childFolders));
        setExpandedKeys(event.expandedKeys);
    };

    // --- FILE ACTION HANDLERS ---
    const handlePreviewFile = useCallback(async (rowData) => {
        const itemPath = rowData.data.path;
        const baseDir = getBaseDirFromPath(itemPath);
        const relativePathForApi = getRelativePath(itemPath);
        const fileName = rowData.label;

        setPreviewFileName(fileName);
        setIsPreviewDialogVisible(true);
        setPreviewContent('');
        setPreviewComparisonContent(null);
        setPreviewComparisonFileName(''); 
        setPreviewPartitions([]); // Reset partitions state

        const lowerName = fileName.toLowerCase();
        
        // --- PREVIEW MODE LOGIC ---
        // Restrict visual preview (Canvas) to specific base directories ("1. Generator" and "2. Index").
        // "parent_dir_dataset" -> corresponds to "1. Generator"
        // "indexes" -> corresponds to "2. Index"
        // All other directories (e.g., Range Query results) should display as plain text, even if they are CSV/WKT.
        const allowedVisualDirs = ['parent_dir_dataset', 'indexes'];
        const isVisualFormat = lowerName.endsWith('.csv') || lowerName.endsWith('.wkt') || lowerName.endsWith('.rsgrove');
        
        // Set visual mode only if both format and directory are supported, otherwise default to text
        setPreviewType((isVisualFormat && allowedVisualDirs.includes(baseDir)) ? 'visual' : 'text');

        try {
            // 1. Fetch Main File Content
            const response = await fetch(`${API_BASE_URL}/preview/file/${relativePathForApi}?base_dir=${baseDir}`);
            if (!response.ok) throw new Error("Load failed");
            const content = await response.text();
            setPreviewContent(content);

            // --- PARTITION GRID LOGIC ---
            // Detect if we are looking at a partition file or the master file itself
            const isPartitionFile = lowerName.startsWith('part-');
            const isMasterFile = lowerName.includes('_master') || lowerName.endsWith('.rsgrove');

            if ((isPartitionFile || isMasterFile) && baseDir === 'indexes') {
                // Determine the folder containing these files
                const pathParts = itemPath.split('/');
                if (pathParts.length >= 4) {
                     const folderPath = pathParts.slice(0, -1).join('/'); 
                     const relativeFolder = getRelativePath(folderPath);

                     // We need to fetch the content of the _master file to draw the grid.
                     // If we are already viewing the master file, we use the content we just fetched.
                     if (isMasterFile) {
                         const partitions = parseMasterContent(content);
                         setPreviewPartitions(partitions);
                     } else {
                         // We are viewing a part-file. We need to find and fetch the sibling master file.
                         try {
                             // List files in current folder to find exact master filename
                             const listResp = await fetch(`${API_BASE_URL}/api/explorer/content?path=${folderPath}`);
                             if(listResp.ok) {
                                 const filesInFolder = await listResp.json();
                                 const masterNode = filesInFolder.find(f => f.label.includes('_master') || f.label.endsWith('.rsgrove'));
                                 
                                 if (masterNode) {
                                     const masterRelPath = `${relativeFolder}/${masterNode.label}`;
                                     const masterResp = await fetch(`${API_BASE_URL}/preview/file/${masterRelPath}?base_dir=${baseDir}`);
                                     if (masterResp.ok) {
                                         const masterText = await masterResp.text();
                                         setPreviewPartitions(parseMasterContent(masterText));
                                     }
                                 }
                             }
                         } catch (e) { console.warn("Failed to load master grid", e); }
                     }
                }
            }

            // --- AUTOMATIC DATASET COMPARISON LOGIC ---
            // If viewing a file inside 'indexes', attempt to find original dataset for background comparison.
            if (baseDir === 'indexes') {
                const pathParts = itemPath.split('/'); 
                if (pathParts.length >= 3) {
                    const collectionName = pathParts[1];
                    const indexFolderName = pathParts[2];
                    
                    if (indexFolderName.endsWith('_spatialIndex')) {
                        const originalDatasetName = indexFolderName.replace('_spatialIndex', '');

                        try {
                            const listResp = await fetch(`${API_BASE_URL}/api/explorer/content?path=parent_dir_dataset/${collectionName}`);
                            if (listResp.ok) {
                                const listData = await listResp.json();
                                const originalFile = listData.find(f => {
                                    if (f.type !== 'file') return false;
                                    const fLower = f.label.toLowerCase();
                                    const targetLower = originalDatasetName.toLowerCase();
                                    
                                    if (!fLower.endsWith('.csv') && !fLower.endsWith('.wkt')) return false;
                                    const nameWithoutExt = f.label.substring(0, f.label.lastIndexOf('.'));
                                    return nameWithoutExt.toLowerCase() === targetLower;
                                });
                                
                                if (originalFile) {
                                    setPreviewComparisonFileName(originalFile.label);
                                    const originalRelativePath = `${collectionName}/${originalFile.label}`;
                                    const compResp = await fetch(`${API_BASE_URL}/preview/file/${originalRelativePath}?base_dir=parent_dir_dataset`);
                                    
                                    if (compResp.ok) {
                                        const compText = await compResp.text();
                                        setPreviewComparisonContent(compText);
                                        // Visual mode is already set by the logic at the beginning of the function
                                        // if we are in 'indexes' and format is correct.
                                    }
                                }
                            }
                        } catch (err) { console.warn("Comparison logic error:", err); }
                    }
                }
            }

        } catch (error) {
            setPreviewContent(`Error: ${error.message}`);
            setPreviewType('text');
        }
    }, []);

    const handleDownloadFile = useCallback(async (rowData) => {
        const itemPath = rowData.data.path;
        const baseDir = getBaseDirFromPath(itemPath);
        const relativePathForApi = getRelativePath(itemPath);
        window.location.href = `${API_BASE_URL}/download/${relativePathForApi}?base_dir=${baseDir}`;
    }, []);

    const handleDeleteFile = useCallback(async (rowData) => {
        if (window.confirm(`Delete "${rowData.label}"?`)) {
            const itemPath = rowData.data.path;
            const baseDir = getBaseDirFromPath(itemPath);
            const relativePathForApi = getRelativePath(itemPath);
            try {
                const response = await fetch(`${API_BASE_URL}/api/folders/${relativePathForApi}?base_dir=${baseDir}`, { method: 'DELETE' });
                if (!response.ok) throw new Error("Delete failed");
                toast.current.show({ severity: 'success', summary: 'Success', detail: 'Deleted' });
                refreshCurrentNodeContent();
            } catch (error) { toast.current.show({ severity: 'error', summary: 'Error', detail: error.message }); }
        }
    }, [refreshCurrentNodeContent]);
    
    // --- FOLDER ACTION HANDLERS ---
    const handleDownloadFolder = async () => {
        if (!selectedNodeKey) return;
        const baseDir = getBaseDirFromPath(selectedNodeKey);
        const relativePath = getRelativePath(selectedNodeKey);
        toast.current.show({ severity: 'info', summary: 'Zipping', detail: 'Wait...', life: 4000 });
        try {
            const zipResponse = await fetch(`${API_BASE_URL}/zip/folder/${relativePath}?base_dir=${baseDir}`);
            if (!zipResponse.ok) throw new Error("Zip failed");
            const { zip_filename } = await zipResponse.json();
            const downloadUrl = `${API_BASE_URL}/download/${zip_filename}?base_dir=${baseDir}`;
            const link = document.createElement('a'); link.href = downloadUrl; link.setAttribute('download', zip_filename);
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(async () => {
                await fetch(`${API_BASE_URL}/download/confirm/${zip_filename}?base_dir=${baseDir}`, { method: 'POST' });
            }, 1000); 
        } catch (error) { toast.current.show({ severity: 'error', summary: 'Error', detail: error.message }); }
    };
    
    const handleDeleteFolder = async () => {
        if (!selectedNodeKey) return;
        if (window.confirm("Delete folder and content?")) {
            const baseDir = getBaseDirFromPath(selectedNodeKey);
            const relativePath = getRelativePath(selectedNodeKey);
            try {
                const response = await fetch(`${API_BASE_URL}/api/folders/${relativePath}?base_dir=${baseDir}`, { method: 'DELETE' });
                if (!response.ok) throw new Error("Delete failed");
                toast.current.show({ severity: 'success', summary: 'Success', detail: 'Deleted' });
                setSelectedNodeKey(null); setFiles([]); await refreshParentOfNode(selectedNodeKey);
            } catch (error) { toast.current.show({ severity: 'error', summary: 'Error', detail: error.message }); }
        }
    };

    const openRenameDialog = () => {
        if (!selectedNodeKey) return;
        const node = findNodeByKey(nodes, selectedNodeKey);
        if (node) { setCurrentNodeToRename(node); setNewFolderName(node.label); setIsRenameDialogVisible(true); }
    };

    const handleRenameFolder = async () => {
        if (!newFolderName || !currentNodeToRename) return;
        const isDatasetFolder = currentNodeToRename.label.startsWith('dataset_');
        if (isDatasetFolder) {
            if (!window.confirm("Deep rename of dataset?")) return;
            try {
                const response = await fetch(`${API_BASE_URL}/api/dataset/rename`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ old_id: currentNodeToRename.label, new_id: newFolderName }),
                });
                if (!response.ok) throw new Error("Rename failed");
                toast.current.show({ severity: 'success', summary: 'Success', detail: 'Renamed' });
                setIsRenameDialogVisible(false); setSelectedNodeKey(null); setFiles([]); fetchRoots(); 
            } catch (error) { toast.current.show({ severity: 'error', summary: 'Error', detail: error.message }); }
        } else {
            const oldPath = getRelativePath(currentNodeToRename.key);
            const baseDir = getBaseDirFromPath(currentNodeToRename.key);
            try {
                const response = await fetch(`${API_BASE_URL}/api/folders/${oldPath}?base_dir=${baseDir}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newName: newFolderName, baseDir: baseDir }),
                });
                if (!response.ok) throw new Error("Rename failed");
                toast.current.show({ severity: 'success', summary: 'Success', detail: 'Renamed' });
                setIsRenameDialogVisible(false); setNewFolderName(''); await refreshParentOfNode(currentNodeToRename.key);
                setSelectedNodeKey(null); setFiles([]);
            } catch (error) { toast.current.show({ severity: 'error', summary: 'Error', detail: error.message }); }
        }
    };

    const handleManualRefresh = useCallback(() => {
        if (loading) return;
        selectedNodeKey ? refreshCurrentNodeContent() : fetchRoots();
    }, [loading, selectedNodeKey, refreshCurrentNodeContent, fetchRoots]);
    
    // --- JSX TEMPLATES ---
    const fileActionTemplate = (rowData) => (
        <div className="flex gap-2">
            <Button icon="pi pi-eye" className="p-button-rounded p-button-info p-button-sm" onClick={() => handlePreviewFile(rowData)} />
            <Button icon="pi pi-download" className="p-button-rounded p-button-success p-button-sm" onClick={() => handleDownloadFile(rowData)} />
            <Button icon="pi pi-trash" className="p-button-rounded p-button-danger p-button-sm" onClick={() => handleDeleteFile(rowData)} />
        </div>
    );
    const nodeTemplate = (node) => (node.type === 'separator' ? <Divider className="my-2" /> : <div className="flex align-items-center"><i className={`${node.type === 'folder' ? "pi pi-folder" : "pi pi-file"} mr-2`}></i><span>{node.label}</span></div>);
    const sizeTemplate = (rowData) => <span>{formatFileSize(rowData.size)}</span>;

    const folderActions = (
        <div className="flex-grow-1 flex gap-2">
            <Button label="Rename" icon="pi pi-pencil" className="p-button-sm" onClick={openRenameDialog} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
            <Button label="Download" icon="pi pi-download" className="p-button-sm p-button-success" onClick={handleDownloadFolder} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
            <Button label="Delete" icon="pi pi-trash" className="p-button-sm p-button-danger" onClick={handleDeleteFolder} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
        </div>
    );
    const endToolbarContent = <Button icon="pi pi-refresh" className="p-button-sm p-button-secondary" onClick={handleManualRefresh} loading={loading} />;
    const renameDialogFooter = <><Button label="Cancel" icon="pi pi-times" className="p-button-text" onClick={() => setIsRenameDialogVisible(false)} /><Button label="Rename" icon="pi pi-check" onClick={handleRenameFolder} autoFocus /></>;

    return (
        <Panel header="File System Explorer" toggleable pt={{ content: { className: 'p-1' } }}>
            <Toolbar start={folderActions} end={endToolbarContent} className="border-none mb-2"/>
            <Toast ref={toast} />
            <Splitter style={{ minHeight: '400px' }} className="border-1 surface-border">
                <SplitterPanel size={40} className="flex flex-col">
                    <div className="w-full flex-grow-1 overflow-auto">
                        <Tree value={nodes} loading={loading} selectionMode="single" selectionKeys={selectedNodeKey} onSelect={onSelect} onExpand={onExpand} expandedKeys={expandedKeys} onCollapse={(e) => setExpandedKeys(e.expandedKeys)} nodeTemplate={nodeTemplate} className="w-full border-none" />
                    </div>
                </SplitterPanel>
                <SplitterPanel size={60} className="flex flex-col">
                    <div className="w-full flex-grow-1">
                        <DataTable value={files} emptyMessage="Select a folder" loading={loading} scrollable scrollHeight="flex" className="h-full" selectionMode="single" selection={selectedFile} onSelectionChange={(e) => { setSelectedFile(e.value); if (onFileSelect) onFileSelect(e.value); }} dataKey="key">
                            <Column field="label" header="Name" body={nodeTemplate} sortable />
                            <Column field="size" header="Size" body={sizeTemplate} sortable style={{ width: '120px' }} />
                            <Column header="Actions" body={fileActionTemplate} style={{ width: '150px' }} />
                        </DataTable>
                    </div>
                </SplitterPanel>
            </Splitter>

            {/* File Preview Dialog */}
            <Dialog header={`Preview: ${previewFileName}`} visible={isPreviewDialogVisible} style={{ width: '90vw' }} contentStyle={{ height: '80vh', overflow: 'hidden' }} modal onHide={() => setIsPreviewDialogVisible(false)}>
                 {previewType === 'visual' ? (
                     <DatasetVisualizer 
                        content={previewContent} 
                        fileName={previewFileName} 
                        comparisonContent={previewComparisonContent} 
                        comparisonFileName={previewComparisonFileName} 
                        partitions={previewPartitions} // Pass the parsed partition grid to the visualizer
                    />
                 ) : (
                    <ScrollPanel style={{ width: '100%', height: '100%' }}><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{previewContent}</pre></ScrollPanel>
                 )}
            </Dialog>

            <Dialog header="Rename Folder" visible={isRenameDialogVisible} style={{ width: '30vw' }} modal footer={renameDialogFooter} onHide={() => setIsRenameDialogVisible(false)}>
                <div className="flex flex-col gap-2"><label htmlFor="folderName">New folder name</label><InputText id="folderName" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} required autoFocus /></div>
            </Dialog>
        </Panel>
    );
}

export default FileExplorer;