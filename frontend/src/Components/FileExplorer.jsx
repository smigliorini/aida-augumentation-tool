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

function FileExplorer({ onFolderSelect, onFileSelect }) {
    // --- STATE MANAGEMENT ---
    const [nodes, setNodes] = useState([]);
    const [files, setFiles] = useState([]);
    const [selectedNodeKey, setSelectedNodeKey] = useState(null);
    const [expandedKeys, setExpandedKeys] = useState({});
    const [loading, setLoading] = useState(false);
    
    const [selectedFile, setSelectedFile] = useState(null);
    
    const [isPreviewDialogVisible, setIsPreviewDialogVisible] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [previewFileName, setPreviewFileName] = useState('');

    const [isRenameDialogVisible, setIsRenameDialogVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [currentNodeToRename, setCurrentNodeToRename] = useState(null);


    const toast = useRef(null);
    const backendUrl = 'http://localhost:5000'; 

    // --- HELPER FUNCTIONS ---
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
    
    const refreshParentOfNode = async (childKey) => {
        const pathParts = childKey.split('/');
        if (pathParts.length <= 1) { 
            fetchRoots();
            return;
        }

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
    
    const fetchRoots = () => {
        setLoading(true);
        fetch(`${backendUrl}/api/explorer/roots`)
            .then(res => res.json())
            .then(data => { setLoading(false); setNodes(data); })
            .catch(error => {
                setLoading(false);
                console.error("Error fetching root folders:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: 'Cannot load root folders' });
            });
    }

    // --- API & DATA FETCHING ---
    const loadNodeContent = useCallback(async (node) => {
        setLoading(true);
        try {
            const response = await fetch(`${backendUrl}/api/explorer/content?path=${node.key}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP Error ${response.status}`);
            }
            const content = await response.json();
            const childFolders = content.filter(item => item.type === 'folder');
            const childFiles = content.filter(item => item.type === 'file');
            
            setFiles(childFiles);
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

    const refreshCurrentNodeContent = useCallback(async () => {
        if (!selectedNodeKey) return;
        
        // --- INIZIO MODIFICA: Migliorata la logica di refresh del nodo corrente ---
        // Trova il nodo nell'albero attuale per ricaricarne i figli
        const nodeToRefresh = findNodeByKey(nodes, selectedNodeKey);
        if (nodeToRefresh) {
            const { childFolders, childFiles } = await loadNodeContent(nodeToRefresh);
            // Aggiorna la lista dei file
            setFiles(childFiles); 

            // Aggiorna l'albero con le nuove sottocartelle
            let newNodes = JSON.parse(JSON.stringify(nodes));
            const nodeInNewTree = findNodeByKey(newNodes, selectedNodeKey);
            if(nodeInNewTree) {
                nodeInNewTree.children = childFolders;
                nodeInNewTree.leaf = childFolders.length === 0;
            }
            setNodes(newNodes);
        }
        // --- FINE MODIFICA ---

    }, [selectedNodeKey, nodes, loadNodeContent]);
    
    useEffect(() => {
        fetchRoots();
    }, []);

    // --- EVENT HANDLERS (Tree) ---
    const onSelect = useCallback((node) => {
        if (node.type !== 'folder') return;
        
        setSelectedNodeKey(node.key);
        setFiles([]);

        setSelectedFile(null);
        if (onFileSelect) {
            onFileSelect(null);
        }
        
        if (onFolderSelect) {
            onFolderSelect(getRelativePath(node.key), getBaseDirFromPath(node.key));
        }
        
        loadNodeContent(node);
    }, [onFolderSelect, onFileSelect, loadNodeContent]);

    const onExpand = async (event) => {
        const node = event.node;
        if (selectedNodeKey !== node.key) {
            onSelect(node);
        }
        if ((node.children && node.children.length > 0) || node.leaf) {
            setExpandedKeys(event.expandedKeys);
            return;
        }

        const { childFolders } = await loadNodeContent(node);
        let newNodes = JSON.parse(JSON.stringify(nodes));
        const nodeToUpdate = findNodeByKey(newNodes, node.key);
        if (nodeToUpdate) {
            nodeToUpdate.children = childFolders;
            if (childFolders.length === 0) {
                nodeToUpdate.leaf = true; 
            }
        }
        setNodes(newNodes);
        setExpandedKeys(event.expandedKeys);
    };

    // --- FILE ACTION HANDLERS ---
    const handlePreviewFile = useCallback(async (rowData) => {
        const itemPath = rowData.data.path;
        const baseDir = getBaseDirFromPath(itemPath);
        const relativePathForApi = getRelativePath(itemPath);
        setPreviewFileName(rowData.label);
        setIsPreviewDialogVisible(true);
        setPreviewContent('Loading...');
        try {
            const response = await fetch(`${backendUrl}/preview/file/${relativePathForApi}?base_dir=${baseDir}`);
            if (!response.ok) throw new Error(await response.text());
            const content = await response.text();
            setPreviewContent(content);
        } catch (error) {
            setPreviewContent(`Error loading file preview: ${error.message}`);
        }
    }, []);

    const handleDownloadFile = useCallback(async (rowData) => {
        const itemPath = rowData.data.path;
        const baseDir = getBaseDirFromPath(itemPath);
        const relativePathForApi = getRelativePath(itemPath);
        window.location.href = `${backendUrl}/download/${relativePathForApi}?base_dir=${baseDir}`;
    }, []);

    const handleDeleteFile = useCallback(async (rowData) => {
        if (window.confirm(`Are you sure to delete "${rowData.label}"?`)) {
            const itemPath = rowData.data.path;
            const baseDir = getBaseDirFromPath(itemPath);
            const relativePathForApi = getRelativePath(itemPath);
            try {
                const response = await fetch(`${backendUrl}/api/folders/${relativePathForApi}?base_dir=${baseDir}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json()).error || 'Deletion failed');
                toast.current.show({ severity: 'success', summary: 'Success', detail: `File "${rowData.label}" deleted.` });
                refreshCurrentNodeContent();
            } catch (error) {
                toast.current.show({ severity: 'error', summary: 'Error', detail: error.message });
            }
        }
    }, [refreshCurrentNodeContent]);
    
    // --- FOLDER ACTION HANDLERS ---

    const handleDownloadFolder = async () => {
        if (!selectedNodeKey) return;
        const baseDir = getBaseDirFromPath(selectedNodeKey);
        const relativePath = getRelativePath(selectedNodeKey);

        toast.current.show({ severity: 'info', summary: 'Zipping', detail: 'Preparing folder for download...', life: 4000 });

        try {
            const zipResponse = await fetch(`${backendUrl}/zip/folder/${relativePath}?base_dir=${baseDir}`);
            if (!zipResponse.ok) throw new Error((await zipResponse.json()).error || 'Failed to create zip file.');
            const { zip_filename } = await zipResponse.json();

            const downloadUrl = `${backendUrl}/download/${zip_filename}?base_dir=${baseDir}`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', zip_filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            setTimeout(async () => {
                try {
                    await fetch(`${backendUrl}/download/confirm/${zip_filename}?base_dir=${baseDir}`, { method: 'POST' });
                } catch (confirmError) {
                    console.error("Failed to confirm download for cleanup:", confirmError);
                }
            }, 1000); 

        } catch (error) {
            toast.current.show({ severity: 'error', summary: 'Download Error', detail: error.message });
        }
    };
    
    const handleDeleteFolder = async () => {
        if (!selectedNodeKey) return;
        const node = findNodeByKey(nodes, selectedNodeKey);
        if (window.confirm(`Are you sure to delete the folder "${node.label}" and all its content?`)) {
            const baseDir = getBaseDirFromPath(selectedNodeKey);
            const relativePath = getRelativePath(selectedNodeKey);
            
            try {
                const response = await fetch(`${backendUrl}/api/folders/${relativePath}?base_dir=${baseDir}`, { method: 'DELETE' });
                if (!response.ok) throw new Error((await response.json()).error || 'Deletion failed');
                
                toast.current.show({ severity: 'success', summary: 'Success', detail: `Folder "${node.label}" deleted.` });
                
                setSelectedNodeKey(null);
                setFiles([]);
                await refreshParentOfNode(selectedNodeKey);
                
            } catch (error) {
                toast.current.show({ severity: 'error', summary: 'Error', detail: error.message });
            }
        }
    };

    const openRenameDialog = () => {
        if (!selectedNodeKey) return;
        const node = findNodeByKey(nodes, selectedNodeKey);
        if (node) {
            setCurrentNodeToRename(node);
            setNewFolderName(node.label);
            setIsRenameDialogVisible(true);
        }
    };

    const handleRenameFolder = async () => {
        if (!newFolderName || !currentNodeToRename) return;

        const oldPath = getRelativePath(currentNodeToRename.key);
        const baseDir = getBaseDirFromPath(currentNodeToRename.key);
        
        try {
            const response = await fetch(`${backendUrl}/api/folders/${oldPath}?base_dir=${baseDir}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName: newFolderName, baseDir: baseDir }),
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Rename failed');

            toast.current.show({ severity: 'success', summary: 'Success', detail: 'Folder renamed successfully.' });
            setIsRenameDialogVisible(false);
            setNewFolderName('');
            
            await refreshParentOfNode(currentNodeToRename.key);
            
            setSelectedNodeKey(null);
            setFiles([]);

        } catch (error) {
            toast.current.show({ severity: 'error', summary: 'Rename Error', detail: error.message });
        }
    };

    // --- INIZIO MODIFICA: Handler per il refresh manuale ---
    const handleManualRefresh = useCallback(() => {
        if (loading) return; // Previene refresh multipli

        if (selectedNodeKey) {
            // Se una cartella è selezionata, ricarica solo quella
            toast.current.show({ severity: 'info', summary: 'Refreshing', detail: 'Updating current folder content...', life: 2000 });
            refreshCurrentNodeContent();
        } else {
            // Altrimenti, ricarica l'intero albero dalla radice
            toast.current.show({ severity: 'info', summary: 'Refreshing', detail: 'Updating folder tree...', life: 2000 });
            fetchRoots();
        }
    }, [loading, selectedNodeKey, refreshCurrentNodeContent]);
    // --- FINE MODIFICA ---
    
    // --- JSX TEMPLATES ---
    const fileActionTemplate = (rowData) => (
        <div className="flex gap-2">
            <Button icon="pi pi-eye" className="p-button-rounded p-button-info p-button-sm" tooltip="Preview" onClick={() => handlePreviewFile(rowData)} />
            <Button icon="pi pi-download" className="p-button-rounded p-button-success p-button-sm" tooltip="Download" onClick={() => handleDownloadFile(rowData)} />
            <Button icon="pi pi-trash" className="p-button-rounded p-button-danger p-button-sm" tooltip="Delete" onClick={() => handleDeleteFile(rowData)} />
        </div>
    );
    
    const nodeTemplate = (node) => {
        if (node.type === 'separator') return <Divider className="my-2" />;
        const icon = node.type === 'folder' ? "pi pi-folder" : "pi pi-file";
        return <div className="flex align-items-center"><i className={`${icon} mr-2`}></i><span>{node.label}</span></div>;
    };

    // --- INIZIO MODIFICA: Aggiunto pulsante di refresh alla Toolbar ---
    const folderActions = (
        <div className="flex-grow-1 flex gap-2">
            <Button label="Rename Folder" icon="pi pi-pencil" className="p-button-sm" onClick={openRenameDialog} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
            <Button label="Download Folder" icon="pi pi-download" className="p-button-sm p-button-success" onClick={handleDownloadFolder} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
            <Button label="Delete Folder" icon="pi pi-trash" className="p-button-sm p-button-danger" onClick={handleDeleteFolder} disabled={!selectedNodeKey || !getRelativePath(selectedNodeKey)} />
        </div>
    );
    
    const endToolbarContent = (
        <Button 
            icon="pi pi-refresh" 
            className="p-button-sm p-button-secondary" 
            tooltip="Refresh View" 
            onClick={handleManualRefresh} 
            loading={loading}
        />
    );
    // --- FINE MODIFICA ---

    const renameDialogFooter = (
        <>
            <Button label="Cancel" icon="pi pi-times" className="p-button-text" onClick={() => setIsRenameDialogVisible(false)} />
            <Button label="Rename" icon="pi pi-check" onClick={handleRenameFolder} autoFocus />
        </>
    );

    return (
        <Panel header="File System Explorer" toggleable pt={{ content: { className: 'p-1' } }}>
            {/* --- INIZIO MODIFICA: Aggiornata la Toolbar --- */}
            <Toolbar start={folderActions} end={endToolbarContent} className="border-none mb-2"/>
            {/* --- FINE MODIFICA --- */}
            <Toast ref={toast} />
            <Splitter style={{ minHeight: '400px' }} className="border-1 surface-border">
                <SplitterPanel size={40} className="flex flex-col">
                    <div className="w-full flex-grow-1 overflow-auto">
                        <Tree value={nodes} loading={loading} selectionMode="single" selectionKeys={selectedNodeKey} onSelect={(e) => onSelect(e.node)} onExpand={onExpand} expandedKeys={expandedKeys} onCollapse={(e) => setExpandedKeys(e.expandedKeys)} nodeTemplate={nodeTemplate} className="w-full border-none" />
                    </div>
                </SplitterPanel>
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
                                if (onFileSelect) {
                                    onFileSelect(e.value);
                                }
                            }}
                            dataKey="key"
                        >
                            <Column field="label" header="Name" body={nodeTemplate} sortable />
                            <Column header="Actions" body={fileActionTemplate} style={{ width: '150px' }} />
                        </DataTable>
                    </div>
                </SplitterPanel>
            </Splitter>

            <Dialog header={`Preview: ${previewFileName}`} visible={isPreviewDialogVisible} style={{ width: '70vw' }} modal onHide={() => setIsPreviewDialogVisible(false)}>
                <ScrollPanel style={{ width: '100%', height: '400px' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{previewContent}</pre>
                </ScrollPanel>
            </Dialog>

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