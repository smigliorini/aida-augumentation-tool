import React, { useState, useRef, useEffect, useCallback } from 'react';
// Import the centralized socket instance and the base URL for API calls.
import { socket, API_BASE_URL } from '../socket';
import MyMenu from "../Components/MyMenu";
import { Divider } from "primereact/divider";
import { Button } from "primereact/button";
import { Toast } from 'primereact/toast';
import { ProgressBar } from 'primereact/progressbar';
import { Dialog } from 'primereact/dialog';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { Message } from 'primereact/message';
import { Panel } from 'primereact/panel';
import FileExplorer from '../Components/FileExplorer';

// Main component for the spatial indexing UI.
function Index() {
    // --- STATE MANAGEMENT ---
    const [selectedDatasetFolder, setSelectedDatasetFolder] = useState(null);
    const [selectedFolderParentDir, setSelectedFolderParentDir] = useState(null);
    const [folderContent, setFolderContent] = useState([]);
    const [displayFileConfigDialog, setDisplayFileConfigDialog] = useState(false);
    const toast = useRef(null);
    const [isIndexing, setIsIndexing] = useState(false);
    const [showProgressDialog, setShowProgressDialog] = useState(false);
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);

    const [globalPartitionType, setGlobalPartitionType] = useState('partitions');
    const [globalDimension, setGlobalDimension] = useState(2);

    // Consolidated state for progress information.
    const [progressInfo, setProgressInfo] = useState({
        progress: 0,
        message: "",
        processed_count: 0,
        total_count: 0
    });

    // --- COMPONENT CONFIGURATION ---
    const partitionTypes = [
        { label: 'Partitions', value: 'partitions' },
        { label: 'Geometries', value: 'geometries' },
        { label: 'Bytes', value: 'bits' }
    ];

    // --- SOCKET EVENT HANDLERS ---
    // We define these handlers outside of useEffect and wrap them in useCallback
    // to prevent stale state closures and ensure they have a stable identity.
    const onProgress = useCallback((data) => {
        console.log("MESSAGE RECEIVED:", data.message); 

        setProgressInfo({
            progress: data.progress,
            message: data.message || "Processing...",
            processed_count: data.processed_count,
            total_count: data.total_count
        });
        // This is the key fix: We no longer check the previous state.
        // If we receive a progress event, we ensure the dialog is visible.
        // This avoids issues with stale state inside the event handler.
        setShowProgressDialog(true);
    }, []); // Empty dependency array is fine as state setters are stable.

    const onComplete = useCallback((data) => {
        toast.current.show({ severity: 'success', summary: 'Success', detail: data.message, life: 5000 });
        setIsIndexing(false);
        setProgressInfo(prev => ({ ...prev, progress: 100, message: "Indexing completed!" }));
        setTimeout(() => {
            setShowProgressDialog(false);
            setProgressInfo({ progress: 0, message: "", processed_count: 0, total_count: 0 });
            setCpuUsage(0);
            setRamUsage(0);
        }, 2000);
    }, []);

    const onError = useCallback((data) => {
        toast.current.show({ severity: 'error', summary: 'Error', detail: data.error, life: 5000 });
        setIsIndexing(false);
        setShowProgressDialog(false);
        setProgressInfo({ progress: 0, message: "", processed_count: 0, total_count: 0 });
        setCpuUsage(0);
        setRamUsage(0);
    }, []);

    const onResourceUsage = useCallback((data) => {
        setCpuUsage(data.cpu);
        setRamUsage(data.ram);
    }, []);

    // --- EFFECTS ---
    useEffect(() => {
        // Connect to the socket server when the component mounts.
        if (!socket.connected) {
            socket.connect();
        }

        // --- REGISTER LISTENERS ---
        socket.on('spatial_indexing_progress', onProgress);
        socket.on('spatial_indexing_complete', onComplete);
        socket.on('spatial_indexing_error', onError);
        socket.on('resource_usage', onResourceUsage);

        // --- EFFECT CLEANUP ---
        return () => {
            // Deregister listeners on component unmount to prevent memory leaks.
            socket.off('spatial_indexing_progress', onProgress);
            socket.off('spatial_indexing_complete', onComplete);
            socket.off('spatial_indexing_error', onError);
            socket.off('resource_usage', onResourceUsage);

            // Disconnect from the socket when the component unmounts.
            if (socket.connected) {
                socket.disconnect();
            }
        };
        // Add the handlers to the dependency array to follow React's rules.
        // useCallback ensures they don't trigger the effect unnecessarily.
    }, [onProgress, onComplete, onError, onResourceUsage]);

    // --- EVENT HANDLERS ---
    const handleFolderSelect = (folderName, parentDir) => {
        if (parentDir === 'parent_dir_dataset') {
            setSelectedDatasetFolder(folderName);
            setSelectedFolderParentDir(parentDir);
            fetchFolderContentForConfig(folderName, parentDir);
        } else {
            setSelectedDatasetFolder(null);
            setSelectedFolderParentDir(null);
            setFolderContent([]);
            if (folderName) {
                toast.current.show({ severity: 'warn', summary: 'Invalid Selection', detail: 'Please select a folder from "1. Generator".', life: 3000 });
            }
        }
    };

    const fetchFolderContentForConfig = async (folderName, parentDir) => {
        if (!folderName || !parentDir) {
            setFolderContent([]);
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/explorer/content?path=${parentDir}/${folderName}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const files = data.filter(item => item.type === 'file' && (item.label.endsWith('.csv') || item.label.endsWith('.wkt') || item.label.endsWith('.geojson')))
                                .map(file => ({
                                    name: file.label,
                                    partitionType: 'partitions',
                                    dimension: 2
                                }));
            setFolderContent(files);
            setGlobalPartitionType('partitions');
            setGlobalDimension(2);
        } catch (error) {
            console.error("Error fetching folder content for config:", error);
            toast.current.show({ severity: 'error', summary: 'Error', detail: `Failed to load folder content: ${error.message}`, life: 5000 });
            setFolderContent([]);
        }
    };
    
    const processSpatialIndexing = async () => {
        if (!selectedDatasetFolder) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Select a folder before indexing.', life: 3000 });
            return;
        }
        if (folderContent.length === 0) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'No indexable files found in the selected folder.', life: 3000 });
            return;
        }
        const invalidDimensionFiles = folderContent.filter(file => typeof file.dimension !== 'number' || isNaN(file.dimension));
        if (invalidDimensionFiles.length > 0) {
            toast.current.show({ severity: 'error', summary: 'Validation Error', detail: `Dimension must be a number for all files. Check: ${invalidDimensionFiles.map(f => f.name).join(', ')}`, life: 7000 });
            return;
        }
        
        setIsIndexing(true);
        setProgressInfo({ 
            progress: 0, 
            message: `Initializing indexing for: "${selectedDatasetFolder}"...`, 
            processed_count: 0, 
            total_count: folderContent.length 
        });
        setCpuUsage(0);
        setRamUsage(0);
        setShowProgressDialog(true);
        setDisplayFileConfigDialog(false);

        try {
            // This HTTP request triggers the indexing process on the backend.
            const response = await fetch(`${API_BASE_URL}/process_spatial_index`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_name: selectedDatasetFolder,
                    files_config: folderContent.map(file => ({
                        fileName: file.name,
                        partitionType: file.partitionType,
                        dimension: file.dimension
                    }))
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP Error: ${response.status}`);
            }
        } catch (error) {
            console.error("Error triggering spatial indexing:", error);
            toast.current.show({ severity: 'error', summary: 'Error', detail: `Indexing error: ${error.message}`, life: 5000 });
            setIsIndexing(false);
            setShowProgressDialog(false);
        }
    };

    const handleApplyToAll = () => {
        if (typeof globalDimension !== 'number' || isNaN(globalDimension)) {
            toast.current.show({ severity: 'error', summary: 'Validation Error', detail: 'Global Dimension must be a valid number.', life: 3000 });
            return;
        }

        const updatedFolderContent = folderContent.map(file => ({
            ...file,
            partitionType: globalPartitionType,
            dimension: globalDimension
        }));

        setFolderContent(updatedFolderContent);
        
        toast.current.show({ 
            severity: 'info', 
            summary: 'Applied', 
            detail: `Set all ${updatedFolderContent.length} files to Type: ${globalPartitionType}, Dimension: ${globalDimension}`, 
            life: 3000 
        });
    };

    const onRowEditComplete = (e) => {
        let _folderContent = [...folderContent];
        let { newData, index } = e;
        _folderContent[index] = newData;
        setFolderContent(_folderContent);
    };

    // --- RENDER HELPERS ---
    const partitionTypeEditor = (options) => (<Dropdown value={options.value} options={partitionTypes} onChange={(e) => options.editorCallback(e.value)} placeholder="Select a Type" />);
    const dimensionEditor = (options) => (<InputNumber value={options.value} onValueChange={(e) => options.editorCallback(e.value)} mode="decimal" />);
    const renderProgressDialogFooter = () => (<div><Button label="Close" icon="pi pi-times" onClick={() => setShowProgressDialog(false)} className="p-button-text" disabled={isIndexing} /></div>);
    const renderFileConfigDialogFooter = () => (
        <div>
            <Button label="Cancel" icon="pi pi-times" onClick={() => setDisplayFileConfigDialog(false)} className="p-button-text" />
            <Button label="Start Indexing" icon="pi pi-play" onClick={processSpatialIndexing} autoFocus />
        </div>
    );
    // This helper now uses the reliable state values instead of parsing strings.
    const progressDisplay = () => {
        const total = progressInfo.total_count || folderContent.length;
        return `${progressInfo.processed_count || 0}/${total}`;
    };

    // --- RENDER ---
    return (
        <>
            <div>
                <MyMenu />
                <Toast ref={toast} />
                <div>
                    <div className="col-12"><h1 className="m-3">Spatial Indexing</h1><Divider className="mb-0"/></div>
                    <div className="col-12 text-center mt-0 mb-1">
                        <Button
                            label="2. Configure and Start Indexing"
                            icon="pi pi-cog"
                            onClick={() => {
                                if (!selectedDatasetFolder) {
                                    toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Select a folder before configuring indexing.', life: 3000 });
                                    return;
                                }
                                if (folderContent.length === 0) {
                                    toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'No indexable files found in the selected folder.', life: 3000 });
                                    return;
                                }
                                setDisplayFileConfigDialog(true);
                            }}
                            disabled={!selectedDatasetFolder || isIndexing}
                            className="p-button-lg"
                        />
                    </div>
                    <Panel header="1. Select a dataset folder">
                        <Message 
                            severity={selectedDatasetFolder ? "info" : "warn"} 
                            text={selectedDatasetFolder ? `Folder selected: ${selectedDatasetFolder}` : "Please select a folder from the '1. Generator' section in the explorer below."} 
                            className="w-full justify-content-center mb-3" 
                        />
                        <FileExplorer onFolderSelect={handleFolderSelect} rootKey="parent_dir_dataset" />
                    </Panel>
                </div>
                <Dialog header="Indexing Progress" visible={showProgressDialog} style={{ width: '50vw' }} onHide={() => !isIndexing && setShowProgressDialog(false)} closable={!isIndexing} footer={renderProgressDialogFooter}>
                    <p className='font-bold'>{progressInfo.message}</p>
                    <div className="flex flex-column gap-3 pt-2">
                        <div><ProgressBar value={progressInfo.progress} displayValueTemplate={progressDisplay}></ProgressBar></div>
                        <Divider />
                        <div>
                            <label>CPU Usage</label>
                            <ProgressBar mode="determinate" value={cpuUsage} color="#FFD700" displayValueTemplate={() => `${cpuUsage.toFixed(1)}%`} />
                        </div>
                        <div>
                            <label>RAM Usage</label>
                            <ProgressBar mode="determinate" value={ramUsage} color="#87CEFA" displayValueTemplate={() => `${ramUsage.toFixed(1)}%`} />
                        </div>
                    </div>
                    {isIndexing && <p className="mt-4 text-center">Performing indexing. This may take some time...</p>}
                </Dialog>
                
                <Dialog header={`Configure Indexing for: ${selectedDatasetFolder}`} visible={displayFileConfigDialog} style={{ width: '70vw' }} onHide={() => setDisplayFileConfigDialog(false)} footer={renderFileConfigDialogFooter}>
                    <p className="mb-3">
                        Please specify the **Partition Type** and **Dimension** for each file. 
                        You can edit row by row, or use the controls below to apply a setting to all files.
                    </p>
                    
                    <Panel header="Apply to All Files" toggleable className="mb-4">
                        <div className="flex flex-wrap gap-3 align-items-end">
                            <div className="flex-1 min-w-0" style={{ minWidth: '200px' }}>
                                <label htmlFor="globalPartitionType" className="font-bold block mb-2">Global Partition Type</label>
                                <Dropdown 
                                    id="globalPartitionType"
                                    value={globalPartitionType} 
                                    options={partitionTypes}
                                    onChange={(e) => setGlobalPartitionType(e.value)} 
                                    placeholder="Select a Type"
                                    className="w-full" 
                                />
                            </div>
                            <div className="flex-1 min-w-0" style={{ minWidth: '150px' }}>
                                <label htmlFor="globalDimension" className="font-bold block mb-2">Global Dimension</label>
                                <InputNumber 
                                    id="globalDimension"
                                    value={globalDimension} 
                                    onValueChange={(e) => setGlobalDimension(e.value)} 
                                    mode="decimal" 
                                    className="w-full"
                                />
                            </div>
                            <div className="flex">
                                <Button 
                                    label="Apply to All" 
                                    icon="pi pi-check-square" 
                                    onClick={handleApplyToAll}
                                    className="p-button-outlined"
                                />
                            </div>
                        </div>
                    </Panel>

                    <DataTable value={folderContent} editMode="row" dataKey="name" onRowEditComplete={onRowEditComplete}>
                        <Column field="name" header="File Name" style={{ width: '40%' }}></Column>
                        <Column field="partitionType" header="Partition Type" editor={partitionTypeEditor} style={{ width: '25%' }}></Column>
                        <Column field="dimension" header="Dimension" editor={dimensionEditor} style={{ width: '20%' }}></Column>
                        <Column rowEditor headerStyle={{ width: '10%', minWidth: '8rem' }} bodyStyle={{ textAlign: 'center' }}></Column>
                    </DataTable>
                </Dialog>
            </div>
        </>
    );
}

export default Index;