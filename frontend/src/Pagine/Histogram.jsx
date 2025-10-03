import React, { useState, useRef, useEffect } from 'react';
import MyMenu from "../Components/MyMenu";
import { Divider } from "primereact/divider";
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Message } from 'primereact/message';
import { Panel } from 'primereact/panel';
// Imports for real-time feedback
import { Dialog } from 'primereact/dialog';
import { ProgressBar } from 'primereact/progressbar';
// The direct import of 'io' is no longer needed.
// import { io } from 'socket.io-client';
import FileExplorer from '../Components/FileExplorer';
// Import the centralized socket instance.
import { socket } from '../socket';

// Main component for generating histograms from dataset files.
function Histogram() {
    // --- STATE MANAGEMENT ---

    // State for the selected folder from the file explorer.
    const [selectedDatasetFolder, setSelectedDatasetFolder] = useState(null);
    const [selectedFolderParentDir, setSelectedFolderParentDir] = useState(null);
    const toast = useRef(null);
    // The backendUrl constant is no longer needed as the URL is managed in the socket module.
    // const backendUrl = 'http://localhost:5000';

    // State for WebSocket, dialog visibility, and resource monitoring.
    // The socket ref is no longer needed; the imported instance is used directly.
    // const socket = useRef(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [dialogVisible, setDialogVisible] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState("");
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);

    // --- EFFECTS ---

    // Effect hook to manage the WebSocket connection and its event listeners.
    useEffect(() => {
        // Connect the centralized socket instance when the component mounts.
        socket.connect();

        // Listen for progress updates from the server.
        socket.on('histogram_progress', (data) => {
            setProgress(data.progress);
            setProgressMessage(`Processing file ${data.processed_count}/${data.total_count}: ${data.file_name}`);
        });

        // Listen for real-time resource usage updates.
        socket.on('resource_usage', (data) => {
            setCpuUsage(data.cpu);
            setRamUsage(data.ram);
        });

        // Handle the successful completion of the histogram generation.
        socket.on('histogram_complete', (data) => {
            toast.current.show({ severity: 'success', summary: 'Success', detail: data.message, life: 7000 });
            setIsProcessing(false);
            setDialogVisible(false);
            setSelectedDatasetFolder(null); // Reset selection after completion.
        });

        // Handle any errors that occur during the process.
        socket.on('histogram_error', (data) => {
            toast.current.show({ severity: 'error', summary: 'Error', detail: data.error, life: 7000 });
            setIsProcessing(false);
            setDialogVisible(false);
        });

        // Cleanup: Disconnect the socket when the component unmounts.
        return () => {
            socket.disconnect();
        };
    }, []); // The empty dependency array ensures this effect runs only once.

    // --- EVENT HANDLERS ---

    // Handles folder selection from the FileExplorer component.
    const handleFolderSelection = (folderName, parentDir) => {
        if (parentDir === 'parent_dir_dataset') {
            setSelectedDatasetFolder(folderName);
            setSelectedFolderParentDir(parentDir);
            if (folderName) {
                toast.current.show({ severity: 'info', summary: 'Folder Selected', detail: `Folder "${folderName}" ready.`, life: 3000 });
            }
        } else {
            // If a folder from another section is selected, reset and show a warning.
            setSelectedDatasetFolder(null);
            setSelectedFolderParentDir(null);
            if (folderName) {
                 toast.current.show({ severity: 'warn', summary: 'Invalid Selection', detail: 'Please select a folder from "1. Generator".', life: 3000 });
            }
        }
    };

    // Initiates the histogram generation process by sending a request to the server.
    const processHistograms = () => {
        if (!selectedDatasetFolder) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Select a folder before processing.', life: 3000 });
            return;
        }
        
        // Reset state, show the progress dialog, and prepare for processing.
        setIsProcessing(true);
        setDialogVisible(true);
        setProgress(0);
        setCpuUsage(0);
        setRamUsage(0);
        setProgressMessage("Starting histogram processing...");

        // Emit the 'process_histograms' event to the backend with the selected folder name.
        socket.emit('process_histograms', { folder_name: selectedDatasetFolder });
    };

    // --- RENDER ---

    return (
        <>
            <MyMenu />
            <div className="col-12"><h1 className="m-3">Histogram</h1><Divider /></div>
            <Toast ref={toast} />
            <div className="card">
                <Panel header="Histogram Generator">
                    {/* Main action button */}
                    <div className="flex justify-content-center mb-4">
                        <Button 
                            label="Process Histograms for Selected Folder" 
                            icon="pi pi-chart-bar"
                            onClick={processHistograms}
                            disabled={!selectedDatasetFolder || isProcessing}
                            loading={isProcessing}
                            className="p-button-lg"
                        />
                    </div>
                    {/* Informational message about the current selection */}
                    <Message 
                        severity={selectedDatasetFolder ? "info" : "warn"} 
                        text={selectedDatasetFolder ? `Ready to process folder: ${selectedDatasetFolder}` : "Please select a folder from the '1. Generator' section in the explorer below."} 
                        className="w-full justify-content-center" 
                    />
                </Panel>
            </div>

            {/* File explorer component for folder selection */}
            <div className='pt-2'>
                <FileExplorer onFolderSelect={handleFolderSelection} />
            </div>

            {/* Dialog for displaying processing progress and resource usage */}
            <Dialog header="Histogram Processing..." visible={dialogVisible} style={{ width: '50vw' }} modal onHide={() => !isProcessing && setDialogVisible(false)} closable={!isProcessing}>
                <p>{progressMessage}</p>
                <div className="flex flex-column gap-3 pt-2">
                    <div>
                        <label>Overall Progress</label>
                        <ProgressBar value={progress} showValue={true} />
                    </div>
                    <div>
                        <label>CPU Usage</label>
                        <ProgressBar mode="determinate" value={cpuUsage} color="#FFD700" displayValueTemplate={() => `${cpuUsage.toFixed(1)}%`} />
                    </div>
                    <div>
                        <label>RAM Usage</label>
                        <ProgressBar mode="determinate" value={ramUsage} color="#87CEFA" displayValueTemplate={() => `${ramUsage.toFixed(1)}%`} />
                    </div>
                </div>
            </Dialog>
        </>
    );
}

export default Histogram;
