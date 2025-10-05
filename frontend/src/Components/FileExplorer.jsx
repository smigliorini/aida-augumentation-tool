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
 * FileExplorer Component
 * * This component renders a comprehensive file explorer interface. It features a two-panel layout:
 * - The left panel displays a folder tree, which can be expanded to navigate the directory structure.
 * - The right panel displays a table of files contained within the currently selected folder.
 * * Features:
 * - Asynchronous loading of folder contents.
 * - Actions for folders: Rename, Download (as zip), Delete.
 * - Actions for files: Preview, Download, Delete.
 * - User feedback through toast notifications.
 * - A manual refresh button to update the view.
 * * @param {object} props - The component's props.
 * @param {function} props.onFolderSelect - Optional callback function triggered when a folder is selected. It receives (relativePath, baseDir).
 * @param {function} props.onFileSelect - Optional callback function triggered when a file is selected. It receives the file object.
 */
function FileExplorer({ onFolderSelect, onFileSelect }) {
    // --- STATE MANAGEMENT ---
    
    // State for the folder tree structure.
    const [nodes, setNodes] = useState([]);
    // State for the files displayed in the data table for the selected folder.
    const [files, setFiles] = useState([]);
    // State to keep track of the currently selected folder's key (path).
    const [selectedNodeKey, setSelectedNodeKey] = useState(null);
    // State to manage which nodes in the tree are currently expanded.
    const [expandedKeys, setExpandedKeys] = useState({});
    // State to show loading indicators while fetching data.
    const [loading, setLoading] = useState(false);
    // State for the currently selected file in the DataTable.
    const [selectedFile, setSelectedFile] = useState(null);
    // State to control the visibility of the file preview dialog.
    const [isPreviewDialogVisible, setIsPreviewDialogVisible] = useState(false);
    // State to hold the content of the file being previewed.
    const [previewContent, setPreviewContent] = useState('');
    // State to hold the name of the file being previewed for the dialog header.
    const [previewFileName, setPreviewFileName] = useState('');
    // State to control the visibility of the folder rename dialog.
    const [isRenameDialogVisible, setIsRenameDialogVisible] = useState(false);
    // State to hold the new name for the folder being renamed.
    const [newFolderName, setNewFolderName] = useState('');
    // State to store the node object of the folder being renamed.
    const [currentNodeToRename, setCurrentNodeToRename] = useState(null);

    // Ref for the Toast component to show notifications programmatically.
    const toast = useRef(null);

    // --- HELPER FUNCTIONS ---

    /**
     * Formats a file size in bytes into a more readable string (Bytes, KB, MB).
     * @param {number} bytes The file size in bytes.
     * @returns {string} The formatted file size string.
     */
    const formatFileSize = (bytes) => {
        if (bytes === undefined || bytes === null) {
            return ''; // Return empty for folders or items without a size.
        }
        if (bytes < 1024) {
            return `${bytes} Bytes`;
        }
        const kilobytes = bytes / 1024;
        if (kilobytes < 1024) {
            return `${kilobytes.toFixed(1)} KB`;
        }
        const megabytes = kilobytes / 1024;
        return `${megabytes.toFixed(1)} MB`;
    };

    /**
     * Extracts the base directory from a full path.
     * e.g., "root1/folderA/file.txt" -> "root1"
     * @param {string} path The full path of the item.
     * @returns {string|null} The base directory name or null if path is invalid.
     */
    const getBaseDirFromPath = (path) => path ? path.split('/')[0] : null;

    /**
     * Extracts the relative path (excluding the base directory).
     * e.g., "root1/folderA/file.txt" -> "folderA/file.txt"
     * @param {string} path The full path of the item.
     * @returns {string} The relative path.
     */
    const getRelativePath = (path) => path ? path.split('/').slice(1).join('/') : '';

    /**
     * Recursively finds a node in the tree state by its key (path).
     * @param {Array} nodesToSearch The array of nodes to search through.
     * @param {string} key The key to find.
     * @returns {object|null} The found node object or null.
     */
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
    
    /**
     * Fetches the root-level folders from the backend to initialize the tree.
     */
    const fetchRoots = useCallback(() => {
        setLoading(true);
        fetch(`${API_BASE_URL}/api/explorer/roots`)
            .then(res => res.json())
            .then(data => { setLoading(false); setNodes(data); })
            .catch(error => {
                setLoading(false);
                console.error("Error fetching root folders:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: 'Cannot load root folders' });
            });
    }, []);

    /**
     * Refreshes the contents of a parent node after one of its children has been modified (e.g., renamed or deleted).
     * @param {string} childKey The key of the child node that was changed.
     */
    const refreshParentOfNode = async (childKey) => {
        const pathParts = childKey.split('/');
        // If the path has only one part, it's a root folder, so refetch all roots.
        if (pathParts.length <= 1) {
            fetchRoots();
            return;
        }

        // Determine the parent's key.
        const parentKey = pathParts.slice(0, -1).join('/');
        let newNodes = JSON.parse(JSON.stringify(nodes)); // Deep copy to avoid state mutation issues.
        const parentNode = findNodeByKey(newNodes, parentKey);
        
        if (parentNode) {
            // Reload the parent node's content from the server.
            const { childFolders } = await loadNodeContent(parentNode);
            parentNode.children = childFolders; // Update its children.
            setNodes(newNodes); // Set the new state for the tree.
            
            // Ensure the parent node remains expanded.
            setExpandedKeys(prevKeys => ({...prevKeys, [parentKey]: true}));
        }
    };
    
    // --- API & DATA FETCHING ---

    /**
     * Fetches the content (subfolders and files) of a given node from the backend.
     * This is wrapped in useCallback to prevent re-creation on every render.
     */
    const loadNodeContent = useCallback(async (node) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/explorer/content?path=${node.key}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP Error ${response.status}`);
            }
            const content = await response.json();
            const childFolders = content.filter(item => item.type === 'folder');
            const childFiles = content.filter(item => item.type === 'file');
            
            setFiles(childFiles); // Update the files table.
            setLoading(false);
            return { childFolders, childFiles };
        } catch (error) {
            console.error("Error loading node content:", error);
            toast.current.show({ severity: 'error', summary: 'Loading Error', detail: error.message, life: 3000 });
            setFiles([]);
            setLoading(false);
            return { childFolders: [], childFiles: [] };
        }
    }, []);
    
    /**
     * Recursively searches for a node by key and updates its children immutably.
     * This is the new, robust helper function for updating the tree state.
     * @param {Array} currentNodes - The array of nodes to search within.
     * @param {string} key - The key of the node to update.
     * @param {Array} newChildren - The new children array for the found node.
     * @returns {Array} A new array of nodes with the target node updated.
     */
    const updateNodeInChildren = (currentNodes, key, newChildren) => {
        return currentNodes.map(node => {
            // Return a new node object with the original properties but with updated children.
            if (node.key === key) {
                return {
                    ...node,
                    children: newChildren,
                    leaf: newChildren.length === 0
                };
            }

            // If this node has children, recurse into them to find the target node.
            if (node.children) {
                return {
                    ...node,
                    children: updateNodeInChildren(node.children, key, newChildren)
                };
            }

            // If it's not the target and has no children, return it unchanged.
            return node;
        });
    };

    /**
     * Reloads the content of the currently selected folder using an immutable update pattern.
     * This is the refactored, more reliable refresh logic.
     */
    const refreshCurrentNodeContent = useCallback(async () => {
        if (!selectedNodeKey) return;

        setLoading(true);
        setNodes(currentNodes => updateNodeInChildren(currentNodes, selectedNodeKey, []));
        await new Promise(resolve => setTimeout(resolve, 0));

        const nodeToRefresh = { key: selectedNodeKey }; // Only need the key to fetch content.
        
        const { childFolders, childFiles } = await loadNodeContent(nodeToRefresh);
        
        // Update the file list in the DataTable.
        setFiles(childFiles);

        // Update the tree state using the new immutable helper.
        // The functional form of setNodes ensures we're updating from the latest state.
        setNodes(currentNodes => updateNodeInChildren(currentNodes, selectedNodeKey, childFolders));
        setExpandedKeys(prevKeys => ({ ...prevKeys, [selectedNodeKey]: true }));

    }, [selectedNodeKey, loadNodeContent]);
    
    // useEffect hook to fetch root folders when the component mounts for the first time.
    useEffect(() => {
        fetchRoots();
    }, [fetchRoots]);

    // --- EVENT HANDLERS (Tree) ---

    /**
     * Handles the selection of a node in the folder tree.
     */
    const onSelect = useCallback((event) => {
        const node = event.node;
        if (node.type !== 'folder') return;
        
        setSelectedNodeKey(node.key);
        setFiles([]); // Clear previous file list.

        setSelectedFile(null); // Deselect any selected file.
        if (onFileSelect) {
            onFileSelect(null);
        }
        
        // Trigger the optional onFolderSelect callback prop.
        if (onFolderSelect) {
            onFolderSelect(getRelativePath(node.key), getBaseDirFromPath(node.key));
        }
        
        // Load the content of the newly selected folder.
        loadNodeContent(node);
    }, [onFolderSelect, onFileSelect, loadNodeContent]);

    /**
     * Handles the expansion of a node in the folder tree.
     * It dynamically loads the node's children if they haven't been loaded yet.
     */
    const onExpand = async (event) => {
        const node = event.node;
        if (selectedNodeKey !== node.key) {
            // If the expanded node is not the currently selected one, select it first.
            onSelect({ node });
        }
        // If children are already loaded or it's a leaf node, just update the expanded keys state.
        if ((node.children && node.children.length > 0) || node.leaf) {
            setExpandedKeys(event.expandedKeys);
            return;
        }

        // Fetch children from the API.
        const { childFolders } = await loadNodeContent(node);
        
        setNodes(currentNodes => updateNodeInChildren(currentNodes, node.key, childFolders));
        setExpandedKeys(event.expandedKeys); // Update the expanded state.
    };

    // --- FILE ACTION HANDLERS ---

    /**
     * Handles the "Preview" action for a file. Fetches its content and displays it in a dialog.
     */
    const handlePreviewFile = useCallback(async (rowData) => {
        const itemPath = rowData.data.path;
        const baseDir = getBaseDirFromPath(itemPath);
        const relativePathForApi = getRelativePath(itemPath);
        setPreviewFileName(rowData.label);
        setIsPreviewDialogVisible(true);
        setPreviewContent('Loading...');
        try {
            const response = await fetch(`${API_BASE_URL}/preview/file/${relativePathForApi}?base_dir=${baseDir}`);
            if (!response.ok) throw new Error(await response.text());
            const content = await response.text();
            setPreviewContent(content);
        } catch (error) {
            setPreviewContent(`Error loading file preview: ${error.message}`);
        }
    }, []);

    /**
     * Handles the "Download" action for a file by redirecting the browser.
     */
    const handleDownloadFile = useCallback(async (rowData) => {
        const itemPath = rowData.data.path;
        const baseDir = getBaseDirFromPath(itemPath);
        const relativePathForApi = getRelativePath(itemPath);
        window.location.href = `${API_BASE_URL}/download/${relativePathForApi}?base_dir=${baseDir}`;
    }, []);

    /**
     * Handles the "Delete" action for a file. Sends a DELETE request to the backend.
     */
    const handleDeleteFile = useCallback(async (rowData) => {
        if (window.confirm(`Are you sure you want to delete "${rowData.label}"?`)) {
            const itemPath = rowData.data.path;
            const baseDir = getBaseDirFromPath(itemPath);
            const relativePathForApi = getRelativePath(itemPath);
            try {
                const response = await fetch(`${API_BASE_URL}/api/folders/${relativePathForApi}?base_dir=${baseDir}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json()).error || 'Deletion failed');
                toast.current.show({ severity: 'success', summary: 'Success', detail: `File "${rowData.label}" deleted.` });
                refreshCurrentNodeContent(); // Refresh the file list.
            } catch (error) {
                toast.current.show({ severity: 'error', summary: 'Error', detail: error.message });
            }
        }
    }, [refreshCurrentNodeContent]);
    
    // --- FOLDER ACTION HANDLERS ---

    /**
     * Handles downloading the currently selected folder as a zip file.
     * It first requests the server to create a zip, then downloads it.
     */
    const handleDownloadFolder = async () => {
        if (!selectedNodeKey) return;
        const baseDir = getBaseDirFromPath(selectedNodeKey);
        const relativePath = getRelativePath(selectedNodeKey);

        toast.current.show({ severity: 'info', summary: 'Zipping', detail: 'Preparing folder for download...', life: 4000 });

        try {
            // Step 1: Request the backend to create a zip file.
            const zipResponse = await fetch(`${API_BASE_URL}/zip/folder/${relativePath}?base_dir=${baseDir}`);
            if (!zipResponse.ok) throw new Error((await zipResponse.json()).error || 'Failed to create zip file.');
            const { zip_filename } = await zipResponse.json();

            // Step 2: Trigger the download of the created zip file.
            const downloadUrl = `${API_BASE_URL}/download/${zip_filename}?base_dir=${baseDir}`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', zip_filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            // Step 3 (Optional): Send a confirmation to the server after a short delay
            // so it can clean up the temporary zip file.
            setTimeout(async () => {
                try {
                    await fetch(`${API_BASE_URL}/download/confirm/${zip_filename}?base_dir=${baseDir}`, { method: 'POST' });
                } catch (confirmError) {
                    console.error("Failed to confirm download for cleanup:", confirmError);
                }
            }, 1000); 

        } catch (error) {
            toast.current.show({ severity: 'error', summary: 'Download Error', detail: error.message });
        }
    };
    
    /**
     * Handles deleting the currently selected folder and all its contents.
     */
    const handleDeleteFolder = async () => {
        if (!selectedNodeKey) return;
        const node = findNodeByKey(nodes, selectedNodeKey);
        if (window.confirm(`Are you sure you want to delete the folder "${node.label}" and all its content?`)) {
            const baseDir = getBaseDirFromPath(selectedNodeKey);
            const relativePath = getRelativePath(selectedNodeKey);
            
            try {
                const response = await fetch(`${API_BASE_URL}/api/folders/${relativePath}?base_dir=${baseDir}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json()).error || 'Deletion failed');
                
                toast.current.show({ severity: 'success', summary: 'Success', detail: `Folder "${node.label}" deleted.` });
                
                // Reset selection and refresh the parent folder to update the tree.
                setSelectedNodeKey(null);
                setFiles([]);
                await refreshParentOfNode(selectedNodeKey);
                
            } catch (error) {
                toast.current.show({ severity: 'error', summary: 'Error', detail: error.message });
            }
        }
    };

    /**
     * Opens the rename dialog and pre-fills it with the current folder's name.
     */
    const openRenameDialog = () => {
        if (!selectedNodeKey) return;
        const node = findNodeByKey(nodes, selectedNodeKey);
        if (node) {
            setCurrentNodeToRename(node);
            setNewFolderName(node.label);
            setIsRenameDialogVisible(true);
        }
    };

    /**
     * Handles the folder rename submission. It now checks if the folder is a dataset
     * and calls the appropriate backend endpoint for either a standard or a deep rename.
     */
    const handleRenameFolder = async () => {
        if (!newFolderName || !currentNodeToRename) return;

        // Check if the folder being renamed is a dataset folder.
        const isDatasetFolder = currentNodeToRename.label.startsWith('dataset_');

        if (isDatasetFolder) {
            // Logic for "deep renaming" a dataset.
            if (!window.confirm(`This is a dataset folder. Renaming it will update all related files and folders across the system. This action cannot be undone. Continue?`)) {
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/api/dataset/rename`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ old_id: currentNodeToRename.label, new_id: newFolderName }),
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Dataset rename failed');
                
                toast.current.show({ severity: 'success', summary: 'Dataset Renamed', detail: result.message || 'All dataset items renamed successfully.' });
                setIsRenameDialogVisible(false);
                
                // Reset selection and perform a full refresh of the explorer.
                setSelectedNodeKey(null);
                setFiles([]);
                fetchRoots(); 
            } catch (error) {
                toast.current.show({ severity: 'error', summary: 'Rename Error', detail: error.message, life: 6000 });
            }
        } else {
            // Standard logic for renaming a single, non-dataset folder.
            const oldPath = getRelativePath(currentNodeToRename.key);
            const baseDir = getBaseDirFromPath(currentNodeToRename.key);
            try {
                const response = await fetch(`${API_BASE_URL}/api/folders/${oldPath}?base_dir=${baseDir}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newName: newFolderName, baseDir: baseDir }),
                });

                if (!response.ok) throw new Error((await response.json()).error || 'Rename failed');

                toast.current.show({ severity: 'success', summary: 'Success', detail: 'Folder renamed successfully.' });
                setIsRenameDialogVisible(false);
                setNewFolderName('');
                
                // Refresh the parent to show the renamed folder.
                await refreshParentOfNode(currentNodeToRename.key);
                
                // Reset selection state.
                setSelectedNodeKey(null);
                setFiles([]);

            } catch (error) {
                toast.current.show({ severity: 'error', summary: 'Rename Error', detail: error.message });
            }
        }
    };

    /**
     * Handles the click on the refresh button.
     * It refreshes the currently selected folder, or the entire tree if no folder is selected.
     */
    const handleManualRefresh = useCallback(() => {
        if (loading) return; // Prevent multiple refreshes.

        if (selectedNodeKey) {
            // If a folder is selected, refresh only its content.
            toast.current.show({ severity: 'info', summary: 'Refreshing', detail: 'Updating current folder content...', life: 2000 });
            refreshCurrentNodeContent();
        } else {
            // Otherwise, refresh the entire tree from the root.
            toast.current.show({ severity: 'info', summary: 'Refreshing', detail: 'Updating folder tree...', life: 2000 });
            fetchRoots();
        }
    }, [loading, selectedNodeKey, refreshCurrentNodeContent, fetchRoots]);
    
    // --- JSX TEMPLATES ---

    /**
     * Template for rendering the action buttons (Preview, Download, Delete) for each file in the DataTable.
     */
    const fileActionTemplate = (rowData) => (
        <div className="flex gap-2">
            <Button icon="pi pi-eye" className="p-button-rounded p-button-info p-button-sm" tooltip="Preview" onClick={() => handlePreviewFile(rowData)} />
            <Button icon="pi pi-download" className="p-button-rounded p-button-success p-button-sm" tooltip="Download" onClick={() => handleDownloadFile(rowData)} />
            <Button icon="pi pi-trash" className="p-button-rounded p-button-danger p-button-sm" tooltip="Delete" onClick={() => handleDeleteFile(rowData)} />
        </div>
    );
    
    /**
     * Template for rendering a node (file or folder) with an appropriate icon and label.
     * Used in both the Tree and the DataTable.
     */
    const nodeTemplate = (node) => {
        if (node.type === 'separator') return <Divider className="my-2" />;
        const icon = node.type === 'folder' ? "pi pi-folder" : "pi pi-file";
        return <div className="flex align-items-center"><i className={`${icon} mr-2`}></i><span>{node.label}</span></div>;
    };

    /**
     * Template for rendering the file size column in the DataTable.
     * It uses the formatFileSize helper to display the size in a readable format.
     */
    const sizeTemplate = (rowData) => {
        // Format the size if the row data represents a file (which will have a size property).
        return <span>{formatFileSize(rowData.size)}</span>;
    };

    /**
     * Defines the content for the start section of the Toolbar (folder actions).
     */
    const folderActions = (
        <div className="flex-grow-1 flex gap-2">
            {/* Disable actions if no folder is selected or if the selected folder is a root directory */}
            <Button label="Rename Folder" icon="pi pi-pencil" className="p-button-sm" onClick={openRenameDialog} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
            <Button label="Download Folder" icon="pi pi-download" className="p-button-sm p-button-success" onClick={handleDownloadFolder} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
            <Button label="Delete Folder" icon="pi pi-trash" className="p-button-sm p-button-danger" onClick={handleDeleteFolder} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
        </div>
    );
    
    /**
     * Defines the content for the end section of the Toolbar (refresh button).
     */
    const endToolbarContent = (
        <Button 
            icon="pi pi-refresh" 
            className="p-button-sm p-button-secondary" 
            tooltip="Refresh View" 
            onClick={handleManualRefresh} 
            loading={loading} // Show a loading spinner on the button while fetching.
        />
    );

    /**
     * Defines the footer buttons for the rename dialog.
     */
    const renameDialogFooter = (
        <>
            <Button label="Cancel" icon="pi pi-times" className="p-button-text" onClick={() => setIsRenameDialogVisible(false)} />
            <Button label="Rename" icon="pi pi-check" onClick={handleRenameFolder} autoFocus />
        </>
    );

    // --- RENDER ---
    return (
        <Panel header="File System Explorer" toggleable pt={{ content: { className: 'p-1' } }}>
            <Toolbar start={folderActions} end={endToolbarContent} className="border-none mb-2"/>
            <Toast ref={toast} />
            <Splitter style={{ minHeight: '400px' }} className="border-1 surface-border">
                {/* Left Panel: Folder Tree */}
                <SplitterPanel size={40} className="flex flex-col">
                    <div className="w-full flex-grow-1 overflow-auto">
                        <Tree 
                            value={nodes} 
                            loading={loading} 
                            selectionMode="single" 
                            selectionKeys={selectedNodeKey} 
                            onSelect={onSelect} 
                            onExpand={onExpand} 
                            expandedKeys={expandedKeys} 
                            onCollapse={(e) => setExpandedKeys(e.expandedKeys)} 
                            nodeTemplate={nodeTemplate} 
                            className="w-full border-none" 
                        />
                    </div>
                </SplitterPanel>
                {/* Right Panel: File Table */}
                <SplitterPanel size={60} className="flex flex-col">
                    <div className="w-full flex-grow-1">
                        <DataTable 
                            value={files} 
                            emptyMessage="Select a folder to view its content" 
                            loading={loading} 
                            scrollable 
                            scrollHeight="flex" 
                            className="h-full"
                            selectionMode="single"
                            selection={selectedFile}
                            onSelectionChange={(e) => {
                                setSelectedFile(e.value);
                                // Trigger the optional onFileSelect callback prop.
                                if (onFileSelect) {
                                    onFileSelect(e.value);
                                }
                            }}
                            dataKey="key"
                        >
                            <Column field="label" header="Name" body={nodeTemplate} sortable />
                            <Column field="size" header="Size" body={sizeTemplate} sortable style={{ width: '120px' }} />
                            <Column header="Actions" body={fileActionTemplate} style={{ width: '150px' }} />
                        </DataTable>
                    </div>
                </SplitterPanel>
            </Splitter>

            {/* File Preview Dialog */}
            <Dialog header={`Preview: ${previewFileName}`} visible={isPreviewDialogVisible} style={{ width: '70vw' }} modal onHide={() => setIsPreviewDialogVisible(false)}>
                <ScrollPanel style={{ width: '100%', height: '400px' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{previewContent}</pre>
                </ScrollPanel>
            </Dialog>

            {/* Folder Rename Dialog */}
            <Dialog header="Rename Folder" visible={isRenameDialogVisible} style={{ width: '30vw' }} modal footer={renameDialogFooter} onHide={() => setIsRenameDialogVisible(false)}>
                <div className="flex flex-col gap-2">
                    <label htmlFor="folderName">New folder name</label>
                    <InputText id="folderName" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} required autoFocus />
                </div>
            </Dialog>
        </Panel>
    );
}

export default FileExplorer;