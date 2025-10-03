import React, { useState, useRef, useEffect } from 'react';
import { Panel } from 'primereact/panel';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { ScrollPanel } from 'primereact/scrollpanel';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
// The direct import of 'io' is no longer needed.
// import { io } from 'socket.io-client';
import { ProgressBar } from 'primereact/progressbar';
import MyMenu from '../Components/MyMenu';
import FileExplorer from '../Components/FileExplorer';
// Import the centralized socket instance.
import { socket } from '../socket';

// Main component for the Balancing Analysis (Rank & Diff) functionality.
function RankDiff() {
    // --- STATE MANAGEMENT ---

    const toast = useRef(null);
    const [loading, setLoading] = useState(false);

    // State for user-configurable parameters.
    const [selectedParameter, setSelectedParameter] = useState(null);
    const [numberIntervals, setNumberIntervals] = useState(10);
    const [selectedRqResultFile, setSelectedRqResultFile] = useState(null);
    
    // State for managing the status dialog visibility and content.
    const [dialogVisible, setDialogVisible] = useState(false);
    const [dialogMessage, setDialogMessage] = useState('');

    // State for WebSocket communication and resource monitoring.
    // The socket ref is no longer needed; the imported instance is used directly.
    // const socket = useRef(null);
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);

    // --- COMPONENT CONFIGURATION ---

    // Options for the parameter selection dropdown.
    const parameters = [
        { label: 'Cardinality', value: 'cardinality' },
        { label: 'Execution Time', value: 'executionTime' },
        { label: 'MBR Tests', value: 'mbrTests' }
    ];

    // --- EFFECTS ---

    // Effect hook to establish and manage the WebSocket connection.
    useEffect(() => {
        // Connect the centralized socket instance when the component mounts.
        socket.connect();

        // Listen for real-time resource usage updates from the server.
        socket.on('resource_usage', (data) => {
            setCpuUsage(data.cpu);
            setRamUsage(data.ram);
        });

        // Listen for the successful completion of the Rank & Diff process.
        socket.on('rank_diff_complete', (data) => {
            setDialogMessage(`Operation completed successfully!\n\nDetails: ${data.details}\n\n--- SCRIPT OUTPUT ---\n${data.output}`);
            toast.current.show({ severity: 'success', summary: 'Success', detail: data.message, life: 5000 });
            setSelectedRqResultFile(null); // Reset file selection on success.
            setLoading(false);
        });

        // Listen for any errors that occur during the process.
        socket.on('rank_diff_error', (data) => {
            setDialogMessage(`Error: ${data.error}\n\n--- SCRIPT OUTPUT ---\n${data.output || 'No output.'}`);
            toast.current.show({ severity: 'error', summary: 'Backend Error', detail: data.error, life: 8000 });
            setLoading(false);
        });

        // Cleanup function to disconnect the socket when the component is unmounted.
        return () => {
            socket.disconnect();
        };
    }, []); // The empty dependency array ensures this effect runs only once.
    
    // --- EVENT HANDLERS ---

    // Updates the state when a file is selected in the FileExplorer.
    const handleFileSelect = (file) => {
        setSelectedRqResultFile(file); 
    };
    
    // Handles the form submission by sending data to the server via WebSocket.
    const handleSubmit = () => {
        if (!selectedParameter || !numberIntervals || !selectedRqResultFile) {
            toast.current.show({ severity: 'error', summary: 'Validation Error', detail: 'Please select a parameter and a result file.', life: 4000 });
            return;
        }

        setLoading(true);
        setDialogVisible(true);
        setDialogMessage('Processing... This may take a while.');
        // Reset resource stats at the beginning of the new process.
        setCpuUsage(0);
        setRamUsage(0);
        
        const payload = {
            paramToCategorize: selectedParameter,
            numberIntervals: numberIntervals,
            rqSessionFolder: '', 
            rqResultFile: selectedRqResultFile.label
        };
        
        // Emits the 'run_rank_diff' event to the server with the payload.
        socket.emit('run_rank_diff', payload);
    };

    // --- RENDER ---

    return (
        <>
            <MyMenu />
            <div className="col-12"><h1 className="m-3">Balancing Analysis</h1><Divider /></div>
            <Panel header="Balancing Analysis - Input & Configuration" toggleable>
                <Toast ref={toast} />
                <div className="p-fluid formgrid grid">
                    {/* Parameter selection dropdown */}
                    <div className="field col-12 md:col-6">
                        <label htmlFor="parameterSelect">1. Parameter to Categorize</label>
                        <Dropdown id="parameterSelect" value={selectedParameter} options={parameters} onChange={(e) => setSelectedParameter(e.value)} placeholder="Select a parameter" className="w-full" />
                    </div>
                    {/* Input for number of intervals */}
                    <div className="field col-12 md:col-6">
                        <label htmlFor="numberIntervals">2. Number of Intervals</label>
                        <InputNumber id="numberIntervals" value={numberIntervals} onValueChange={(e) => setNumberIntervals(e.value)} mode="decimal" showButtons min={1} className="w-full" />
                    </div>
                </div>

                {/* Informational message about the selected file */}
                <Message 
                    severity={selectedRqResultFile ? "success" : "warn"} 
                    text={
                        selectedRqResultFile ? `Ready to process: ${selectedRqResultFile.label}` : 
                        "Please select a result file from the '3. Range Query' section in the explorer below."
                    } 
                    className="mt-3 w-full" 
                />

                {/* Submit button */}
                <div className="flex justify-content-end mt-4">
                    <Button label="Generate Rank & Diff Sets" icon="pi pi-play" onClick={handleSubmit} loading={loading} />
                </div>

                {/* Dialog for displaying process status and results */}
                <Dialog header="Rank & Diff Generation Status" visible={dialogVisible} style={{ width: '60vw' }} modal onHide={() => setDialogVisible(false)}>
                    <ScrollPanel style={{ width: '100%', height: '400px' }}>
                        {/* Resource monitoring bars are shown while loading */}
                        {loading && (
                            <div className="flex flex-column gap-3 mb-4">
                                <div>
                                    <label>CPU Usage</label>
                                    <ProgressBar mode="determinate" value={cpuUsage} color="#FFD700" displayValueTemplate={() => `${cpuUsage.toFixed(1)}%`} />
                                </div>
                                <div>
                                    <label>RAM Usage</label>
                                    <ProgressBar mode="determinate" value={ramUsage} color="#87CEFA" displayValueTemplate={() => `${ramUsage.toFixed(1)}%`} />
                                </div>
                            </div>
                        )}
                        {/* Displays messages and script output from the server */}
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                            {dialogMessage}
                        </pre>
                    </ScrollPanel>
                    {!loading && <div className="flex justify-content-end mt-3"><Button label="Close" icon="pi pi-times" onClick={() => setDialogVisible(false)} /></div>}
                </Dialog>
            </Panel>

            <Divider align="center" className="my-5">
                <span className="p-tag bg-green-500">File System</span>
            </Divider>
            
            {/* File explorer component for selecting the input file */}
            <FileExplorer 
                onFileSelect={handleFileSelect}
            />
        </>
    );
}

export default RankDiff;