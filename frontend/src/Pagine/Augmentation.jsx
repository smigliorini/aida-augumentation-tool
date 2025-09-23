import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Dialog } from 'primereact/dialog';
import { ProgressBar } from 'primereact/progressbar';

// --- PrimeReact Component Imports ---
import MyMenu from '../Components/MyMenu';
import FileExplorer from '../Components/FileExplorer';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { Message } from 'primereact/message';
import { Panel } from 'primereact/panel';
import { Divider } from 'primereact/divider';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { MultiSelect } from 'primereact/multiselect';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';

// Main component for the data augmentation process.
function Augmentation() {
    // --- COMPONENT STATE ---
    
    // State for file selection and derived data.
    const [selectedBinFile, setSelectedBinFile] = useState(null);
    const [uniqueCode, setUniqueCode] = useState(null); // Inferred from the selected file path.
    
    // State for the content preview of the selected bin file.
    const [binFileContent, setBinFileContent] = useState([]);
    const [binOptions, setBinOptions] = useState([]); // Dropdown options for bin numbers.
    const [previewColumns, setPreviewColumns] = useState([]);

    // State for the augmentation task form.
    const [currentBinNum, setCurrentBinNum] = useState(null);
    const [currentNumQueries, setCurrentNumQueries] = useState(1);
    const [currentDistribution, setCurrentDistribution] = useState(null);
    const [currentAugmentationTechniques, setCurrentAugmentationTechniques] = useState([]);
    const [augmentationTasks, setAugmentationTasks] = useState([]); // List of tasks to be executed.
    
    // State for distribution options and their loading status.
    const [distributionOptions, setDistributionOptions] = useState([]);
    const [distributionsLoading, setDistributionsLoading] = useState(false);

    // General loading and error state.
    const [loading, setLoading] = useState(false);
    const [errorSummary, setErrorSummary] = useState('');
    const [errorDetails, setErrorDetails] = useState('');
    
    // Refs for toast notifications and WebSocket connection.
    const toast = useRef(null);
    const socket = useRef(null);

    // State for progress dialog and resource monitoring.
    const [showProgressDialog, setShowProgressDialog] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);
    const [progressInfo, setProgressInfo] = useState({ current: 0, total: 0, message: 'Starting...' });

    // Options for the augmentation technique MultiSelect dropdown.
    const augmentationTechniqueOptions = [
        { label: 'Rotation', value: 'rotation' },
        { label: 'Noise', value: 'noise' },
        { label: 'Merge', value: 'merge' },
    ];

    // --- EFFECTS ---

    // Effect for establishing and managing the WebSocket connection.
    useEffect(() => {
        socket.current = io('http://localhost:5000');

        socket.current.on('connect', () => console.log('Socket.IO connected for Augmentation page'));
        
        // Listen for real-time resource usage updates.
        socket.current.on('resource_usage', (data) => {
            setCpuUsage(data.cpu);
            setRamUsage(data.ram);
        });

        // Listen for progress updates during the augmentation process.
        socket.current.on('augmentation_progress', (data) => {
            setProgressInfo({ current: data.current, total: data.total, message: data.message });
        });

        // Handle successful completion of the augmentation process.
        socket.current.on('augmentation_complete', (data) => {
            const successDetail = data.logFile 
                ? `Process finished. Log saved to: ${data.logFile}`
                : 'Process finished successfully.';
            toast.current.show({ severity: 'success', summary: 'Success', detail: successDetail, life: 6000 });
            
            setIsExecuting(false);
            setShowProgressDialog(false);
        });

        // Handle errors reported by the server.
        socket.current.on('augmentation_error', (data) => {
            const summary = data.error || "An unexpected error occurred.";
            const details = data.details || 'No additional details provided.';
            
            setErrorSummary(summary);
            setErrorDetails(details);

            toast.current.show({ severity: 'error', summary: 'Execution Error', detail: summary, life: 5000 });
            setIsExecuting(false);
            setShowProgressDialog(false);
        });

        // Cleanup: Disconnect the socket when the component unmounts.
        return () => {
            if (socket.current) socket.current.disconnect();
        };
    }, []);

    // Effect that triggers when a bin file is selected. It fetches file content and available distributions.
     useEffect(() => {
        // Reset state if no file is selected.
        if (!selectedBinFile) {
            setBinFileContent([]); setBinOptions([]); setPreviewColumns([]);
            setDistributionOptions([]); setCurrentDistribution(null);
            return;
        }

        // Fetch the content of the selected bin file for preview.
        setLoading(true);
        axios.get(`http://localhost:5000/api/augmentation/bin-file-content`, { params: { path: selectedBinFile.data.path } })
            .then(response => {
                const data = response.data; setBinFileContent(data);
                if (data && data.length > 0) {
                    // Dynamically create columns for the preview table.
                    const columns = Object.keys(data[0]).map(key => ({ field: key, header: key.charAt(0).toUpperCase() + key.slice(1) }));
                    setPreviewColumns(columns);
                    // Extract unique bin numbers for the dropdown.
                    const bins = [...new Set(data.map(item => item.bin))].map(bin => ({ label: `${bin}`, value: bin }));
                    setBinOptions(bins);
                }
            }).catch(err => {
                const errorMessage = err.response?.data?.error || "Failed to load bin file content.";
                setErrorSummary(errorMessage);
                toast.current.show({ severity: 'error', summary: 'Error', detail: errorMessage, life: 5000 });
            }).finally(() => setLoading(false));

        // Fetch the available distribution types based on the selected bin file.
        setDistributionsLoading(true); setCurrentDistribution(null);
        axios.get(`http://localhost:5000/api/augmentation/distributions`, { params: { bin_file_path: selectedBinFile.data.path } })
            .then(response => {
                const formattedOptions = response.data.map(dist => ({ label: dist.charAt(0).toUpperCase() + dist.slice(1), value: dist }));
                setDistributionOptions(formattedOptions);
            }).catch(err => {
                const distErrorMessage = err.response?.data?.error || "Failed to load distribution options.";
                toast.current.show({ severity: 'error', summary: 'Distribution Error', detail: distErrorMessage, life: 5000 });
                setDistributionOptions([]);
            }).finally(() => setDistributionsLoading(false));
    }, [selectedBinFile]);

    // --- EVENT HANDLERS ---

    // Handles the selection of a bin file from the FileExplorer.
    const handleBinFileSelect = (node) => {
        if (node && node.type === 'file' && node.label.startsWith('bin_') && node.label.endsWith('.csv')) {
            setErrorSummary(''); setErrorDetails('');
            setAugmentationTasks([]); setSelectedBinFile(node);
            // Infer the unique session code from the file path.
            const pathParts = node.data.path.split('/');
            setUniqueCode(pathParts[1]);
        } else {
            setSelectedBinFile(null); setUniqueCode(null);
        }
    };
    
    // Resets the form fields for adding a new augmentation task.
    const resetCurrentTaskForm = () => {
        setCurrentBinNum(null); setCurrentNumQueries(1);
        setCurrentDistribution(null); setCurrentAugmentationTechniques([]);
    };

    // Validates and adds a new augmentation task to the list.
    const handleAddTask = () => {
        if (currentBinNum === null || !currentNumQueries || !currentDistribution || currentAugmentationTechniques.length === 0) {
            toast.current.show({ severity: 'warn', summary: 'Incomplete Task', detail: 'Please fill all fields before adding a task.', life: 4000 });
            return;
        }
        const newTask = {
            id: augmentationTasks.length + 1, bin_num: currentBinNum,
            num_queries: currentNumQueries, distribution: currentDistribution,
            augmentation_technique: currentAugmentationTechniques,
        };
        setAugmentationTasks([...augmentationTasks, newTask]); resetCurrentTaskForm();
        toast.current.show({ severity: 'success', summary: 'Task Added', detail: 'The augmentation task has been added to the list.', life: 3000 });
    };

    // Removes a task from the list of augmentation tasks.
    const handleRemoveTask = (taskIdToRemove) => {
        // Filter the tasks array, keeping only tasks that don't match the ID to be removed.
        setAugmentationTasks(currentTasks => currentTasks.filter(task => task.id !== taskIdToRemove));
        
        // Show a confirmation toast.
        toast.current.show({ 
            severity: 'info', 
            summary: 'Task Removed', 
            detail: 'The task has been removed from the list.', 
            life: 3000 
        });
    };

    // Submits the list of augmentation tasks to the server for execution.
    const handleRunScript = () => {
        if (!selectedBinFile || !uniqueCode) {
            setErrorSummary("Please select a valid 'bin_..._ts.csv' file first."); return;
        }
        if (augmentationTasks.length === 0) {
            setErrorSummary("Please add at least one augmentation task to the list."); return;
        }
        setIsExecuting(true); setShowProgressDialog(true); 
        setErrorSummary(''); setErrorDetails('');
        setProgressInfo({ current: 0, total: augmentationTasks.length, message: 'Initializing...' });
        const fullPath = selectedBinFile.data.path;
        const trainingSetDirectoryPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        const payload = {
            trainingSetPath: trainingSetDirectoryPath,
            pathDatasets: `parent_dir_dataset/${uniqueCode}`,
            pathIndexes: `indexes/${uniqueCode}`,
            inputs: augmentationTasks,
        };
        socket.current.emit('run_augmentation', payload);
    };

    // --- RENDER HELPERS ---
    
    // Template for rendering the augmentation techniques in the DataTable.
    const techniquesBodyTemplate = (rowData) => (
        rowData.augmentation_technique.map(tech => <Tag key={tech} value={tech} className="mr-2" />)
    );

    // Calculates the overall progress percentage for the progress bar.
    const progressPercentage = progressInfo.total > 0 ? (progressInfo.current / progressInfo.total) * 100 : 0;

    // --- RENDER ---
    
    return (
        <div>
            <MyMenu />
            <Toast ref={toast} />
            <div className="grid">
                <div className="col-12"><h1 className="m-3">Augmentation</h1><Divider /></div>
                
                {/* Step 1: Bin File Selection */}
                <div className="col-12">
                    <Card title="1. Select Bin File">
                        <Message severity="info" text="Select a 'bin_..._ts.csv' file from '4. Balancing Analysis'. The source dataset and index folders will be inferred automatically." className="mb-3" />
                        <FileExplorer onFileSelect={handleBinFileSelect} rootKey="trainingSets" />
                    </Card>
                </div>

                {/* Display inferred paths when a file is selected */}
                {selectedBinFile && (
                    <div className="col-12 mt-3">
                        <Panel header="Current Selection" toggleable>
                            <div className="flex flex-column sm:flex-row sm:align-items-center sm:gap-5">
                                <p className="m-0"><strong>Selected Bin File:</strong><br/>{selectedBinFile.label}</p><Divider layout="vertical" className="hidden sm:flex" />
                                <p className="m-0"><strong>Inferred Dataset Folder:</strong><br/>{uniqueCode}</p><Divider layout="vertical" className="hidden sm:flex" />
                                <p className="m-0"><strong>Inferred Index Folder:</strong><br/>{uniqueCode}</p>
                            </div>
                        </Panel>
                    </div>
                )}
                
                {/* Task Configuration */}
                {selectedBinFile && (
                    <div className="col-12 mt-3">
                        <Card title="2. Configure Augmentation Tasks">
                            {/* Preview of the selected bin file */}
                            <Panel header={`Preview: ${selectedBinFile.label}`} toggleable>
                                <DataTable value={binFileContent} scrollable scrollHeight="250px" size="small" loading={loading} responsiveLayout="scroll">
                                    {previewColumns.map(col => <Column key={col.field} field={col.field} header={col.header} sortable />)}
                                </DataTable>
                            </Panel>
                            {/* Form to add a new task */}
                            <div className="grid align-items-end pt-4">
                                <div className="col-12 md:col-6 xl:col-3 field p-fluid">
                                    <label htmlFor="bin_num" className="font-bold block mb-2">Bin Number</label>
                                    <Dropdown id="bin_num" value={currentBinNum} options={binOptions} onChange={(e) => setCurrentBinNum(e.value)} placeholder="Select a Bin" optionLabel="label" />
                                </div>
                                <div className="col-12 md:col-6 xl:col-3 field p-fluid">
                                    <label htmlFor="num_queries" className="font-bold block mb-2">Number of Queries</label>
                                    <InputNumber id="num_queries" value={currentNumQueries} onValueChange={(e) => setCurrentNumQueries(e.value)} min={1} />
                                </div>
                                <div className="col-12 md:col-6 xl:col-3 field p-fluid">
                                    <label htmlFor="distribution" className="font-bold block mb-2">Distribution</label>
                                    <Dropdown id="distribution" value={currentDistribution} options={distributionOptions} onChange={(e) => setCurrentDistribution(e.value)} placeholder="Select a Distribution" disabled={!selectedBinFile || distributionsLoading} loading={distributionsLoading}/>
                                </div>
                                <div className="col-12 md:col-6 xl:col-3 field p-fluid">
                                    <label htmlFor="techniques" className="font-bold block mb-2">Technique(s)</label>
                                    <MultiSelect id="techniques" value={currentAugmentationTechniques} options={augmentationTechniqueOptions} onChange={(e) => setCurrentAugmentationTechniques(e.value)} placeholder="Select Technique(s)" display="chip" />
                                </div>
                                <div className="col-12 text-right mt-3">
                                    <Button label="Add Task to List" icon="pi pi-plus" onClick={handleAddTask} />
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Execution */}
                {augmentationTasks.length > 0 && (
                    <div className="col-12 mt-3">
                        <Card title="3. Execute">
                            <p>The following tasks will be executed. Press 'Run Augmentation' to start the process.</p>
                            {/* Table of tasks to be executed */}
                            <DataTable value={augmentationTasks} className="mb-4" size="small" responsiveLayout="scroll">
                                <Column field="bin_num" header="Bin" />
                                <Column field="num_queries" header="Num Queries" />
                                <Column field="distribution" header="Distribution" />
                                <Column header="Techniques" body={techniquesBodyTemplate} />
                                <Column
                                    header="Actions"
                                    body={(rowData) => (
                                        <Button
                                            icon="pi pi-trash"
                                            className="p-button-rounded p-button-danger p-button-text"
                                            onClick={() => handleRemoveTask(rowData.id)}
                                            tooltip="Remove Task"
                                            tooltipOptions={{ position: 'top' }}
                                        />
                                    )}
                                    style={{ width: '5rem', textAlign: 'center' }}
                                />
                            </DataTable>
                            {/* Execution button and error display */}
                            <Button label={isExecuting ? 'Execution in progress...' : 'Run Augmentation'} icon="pi pi-play" className="w-full p-button-success mb-3" onClick={handleRunScript} disabled={isExecuting} />
                            
                            {errorSummary && <Message severity="error" text={errorSummary} className="mb-2 w-full" />}
                            
                            {errorDetails && (
                                <Panel header="Error Details" toggleable className="mt-2">
                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '400px', overflowY: 'auto', background: '#212120', color: '#FFFFFF', border: '1px solid #ccc', padding: '10px', borderRadius: '4px' }}>
                                        {errorDetails}
                                    </pre>
                                </Panel>
                            )}
                        </Card>
                    </div>
                )}
                
                {/* Initial informational message */}
                {!selectedBinFile && <div className="col-12 mt-3"><Message severity="info" text="To begin, please select a valid 'bin' file from the explorer." /></div>}
            </div>

            {/* Progress Dialog */}
            <Dialog header="Augmentation Process Execution" visible={showProgressDialog} style={{ width: '50vw' }} modal closable={!isExecuting} onHide={() => !isExecuting && setShowProgressDialog(false)}>
                <div className="flex flex-column gap-3 pt-2">
                    <div>
                        <label className='font-bold'>{progressInfo.message}</label>
                        <ProgressBar mode="determinate" value={progressPercentage} displayValueTemplate={() => `${progressInfo.current} / ${progressInfo.total}`} className="mt-2" />
                    </div><Divider/>
                    <div><label>CPU Usage</label><ProgressBar mode="determinate" value={cpuUsage} color="#FFD700" displayValueTemplate={() => `${cpuUsage.toFixed(1)}%`} /></div>
                    <div><label>RAM Usage</label><ProgressBar mode="determinate" value={ramUsage} color="#87CEFA" displayValueTemplate={() => `${ramUsage.toFixed(1)}%`} /></div>
                </div>
                {isExecuting && <p className="mt-4 text-center">The augmentation process is running. This might take several minutes...</p>}
            </Dialog>
        </div>
    );
}

export default Augmentation;
