import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Panel } from 'primereact/panel';
import { FloatLabel } from 'primereact/floatlabel';
import { InputNumber } from 'primereact/inputnumber';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { io } from 'socket.io-client';
import { Toast } from 'primereact/toast';
import MyMenu from '../Components/MyMenu';
import { Divider } from 'primereact/divider';
import { FileUpload } from 'primereact/fileupload';
import { InputSwitch } from 'primereact/inputswitch';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import FileExplorer from '../Components/FileExplorer';

// Main component for generating and executing range queries.
function RangeQuery() {
    // --- STATE MANAGEMENT ---

    // State for query input parameters.
    const [numQuery, setNumQuery] = useState(null);
    const [queryArea, setQueryArea] = useState(null);
    const [minX, setMinX] = useState(null);
    const [minY, setMinY] = useState(null);
    const [maxX, setMaxX] = useState(null);
    const [maxY, setMaxY] = useState(null);
    const [areaint, setAreaint] = useState(null);

    // State for managing the list of queries to be executed.
    const [queries, setQueries] = useState([]);

    // State for handling server communication and UI feedback.
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const socket = useRef(null);
    const [progress, setProgress] = useState(0);
    const toast = useRef(null);

    // State for CSV upload functionality.
    const [csvFile, setCsvFile] = useState(null);
    const [useCsvUpload, setUseCsvUpload] = useState(false);
    const [inputCsvFileName, setInputCsvFileName] = useState(null);

    // State for folder and dataset selection.
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [selectedFolderBaseDir, setSelectedFolderBaseDir] = useState(null);
    const [availableDatasetsInFolder, setAvailableDatasetsInFolder] = useState([]);
    const [selectedDatasetForQuery, setSelectedDatasetForQuery] = useState(null);
    
    // State for the progress dialog.
    const [showProgressDialog, setShowProgressDialog] = useState(false);
    const [queryProgressMessage, setQueryProgressMessage] = useState("");
    const [isQueryExecuting, setIsQueryExecuting] = useState(false);
    const [outputFolderName, setOutputFolderName] = useState("");

    // State for system resource monitoring.
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);

    // --- COMPONENT CONFIGURATION ---

    // Defines the columns for the queries table.
    const columns = [
        { field: 'datasetName', header: 'Dataset Name' },
        { field: 'numQuery', header: 'Number of Queries' },
        { field: 'queryArea', header: 'Query Area' },
        { field: 'minX', header: 'Min X' }, { field: 'minY', header: 'Min Y' },
        { field: 'maxX', header: 'Max X' }, { field: 'maxY', header: 'Max Y' },
        { field: 'areaint', header: 'Area Intersection' },
        { header: 'Actions', body: (rowData) => (<Button icon="pi pi-trash" className="p-button-danger" onClick={() => handleDelete(rowData)} />) }
    ];

    // --- DATA FETCHING ---

    // Fetches the list of available datasets from a selected folder to populate the dropdown.
    const fetchDatasetsForDropdown = useCallback(async (folderName, parentDir) => {
        if (parentDir !== 'parent_dir_dataset') {
            setAvailableDatasetsInFolder([]);
            setSelectedDatasetForQuery(null);
            return;
        }
        try {
            const response = await fetch(`http://127.0.0.1:5000/api/explorer/content?path=${parentDir}/${folderName}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const files = data.filter(item => item.type === 'file' && (item.label.endsWith('.csv') || item.label.endsWith('.wkt')))
                                .map(item => ({ label: item.label.replace(/\.(csv|wkt)$/, ''), value: item.label.replace(/\.(csv|wkt)$/, '') }));
            setAvailableDatasetsInFolder(files);
        } catch (e) {
            console.error("Failed to fetch folder content:", e);
            setAvailableDatasetsInFolder([]);
        }
    }, []);

    // --- EVENT HANDLERS & LOGIC ---
    
    // Handles folder selection from the FileExplorer component.
    const handleFolderSelect = (folderName, parentDir) => {
        setSelectedFolder(folderName);
        setSelectedFolderBaseDir(parentDir);
        fetchDatasetsForDropdown(folderName, parentDir);
    };

    // Effect hook to manage the WebSocket connection.
    useEffect(() => {
        socket.current = io('http://127.0.0.1:5000');
        
        // Listens for query progress updates from the server.
        socket.current.on('range_query_progress', (data) => {
            setProgress(data.progress);
            setQueryProgressMessage(`Processed: ${data.current_dataset} (${data.processed_count}/${data.total_count})`);
            if (!showProgressDialog) setShowProgressDialog(true);
        });

        // Listens for real-time CPU and RAM data.
        socket.current.on('resource_usage', (data) => {
            setCpuUsage(data.cpu);
            setRamUsage(data.ram);
        });
    
        // Handles query generation errors from the server.
        socket.current.on('generate_query_error', (data) => {
            toast.current.show({ severity: 'error', summary: 'Error', detail: data.error, life: 5000 });
            setIsQueryExecuting(false);
            setShowProgressDialog(false);
            setCpuUsage(0); // Reset on error.
            setRamUsage(0); // Reset on error.
        });
    
        // Handles the completion of the query generation process.
        socket.current.on('generate_query_complete', (data) => {
            toast.current.show({ severity: 'success', summary: 'Success', detail: 'Range Query completed successfully!', life: 5000 });
            setIsQueryExecuting(false);
            setOutputFolderName(data.output_folder_name);
            setShowProgressDialog(false);
            setCpuUsage(0); // Reset on completion.
            setRamUsage(0); // Reset on completion.
        });
    
        // Cleanup function to disconnect the socket when the component unmounts.
        return () => {
            if (socket.current) socket.current.disconnect();
        };
    }, []);

    // Handles the selection of a CSV file for upload.
    const handleCsvFileUpload = (event) => {
        const file = event.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setCsvFile(e.target.result);
            reader.readAsDataURL(file);
        }
    };

    // Validates inputs and adds the current query configuration to the table.
    const insertQuery = () => {
        if (!selectedDatasetForQuery || numQuery === null || queryArea === null || minX === null || minY === null || maxX === null || maxY === null || areaint === null) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please select a dataset and fill all query fields.', life: 5000 });
            return;
        }
        const newQuery = { datasetName: selectedDatasetForQuery, numQuery, queryArea, minX, minY, maxX, maxY, areaint };
        setQueries([...queries, newQuery]);
        // Reset input fields for the next entry.
        setSelectedDatasetForQuery(null); setNumQuery(null); setQueryArea(null);
        setMinX(null); setMinY(null); setMaxX(null); setMaxY(null); setAreaint(null);
    };

    // Removes a query from the table.
    const handleDelete = (rowData) => {
        setQueries(queries.filter(q => q !== rowData));
    };
    
    // Resets the UI state before starting query execution.
    const startQueryExecution = () => {
        if (!selectedFolder || selectedFolderBaseDir !== 'parent_dir_dataset') {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please select a valid dataset folder from "1. Generator".', life: 5000 });
            return;
        }
        setIsQueryExecuting(true);
        setShowProgressDialog(true);
        setQueryProgressMessage("Starting query execution...");
        setProgress(0);
        // Reset resource usage on start.
        setCpuUsage(0);
        setRamUsage(0);
    };

    // Sends the manually entered queries to the server for execution.
    const generateQueries = () => {
        if (queries.length === 0) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Add at least one query to the table.', life: 5000 });
            return;
        }
        
        if (socket.current && socket.current.connected) {
            startQueryExecution();
            // Callback to confirm the server received the request
            socket.current.emit('generate_queries', { queries, folder: selectedFolder }, (response) => {
                if (response && response.status === 'started') {
                    console.log('Server confirmed: Range Query process started.');
                } else {
                    console.error('Server did not confirm process start.');
                    toast.current.show({ severity: 'error', summary: 'Connection Error', detail: 'Could not start the process on the server.', life: 5000 });
                    setIsQueryExecuting(false);
                    setShowProgressDialog(false);
                }
            });
        } else {
            toast.current.show({ severity: 'error', summary: 'Not Connected', detail: 'Not connected to the server. Please wait or refresh.', life: 5000 });
        }
    };

    // Sends the uploaded CSV file to the server to generate queries.
    const generateQueriesCsv = () => {
        if (!csvFile) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please upload a CSV file.', life: 3000 });
            return;
        }
    
        if (socket.current && socket.current.connected) {
            startQueryExecution();
            socket.current.emit('generate_queries_from_csv', { csvFile, folder: selectedFolder }, (response) => {
                if (response && response.status === 'started') {
                    console.log('Server confirmed: Range Query process from CSV started.');
                } else {
                    console.error('Server did not confirm process start.');
                    toast.current.show({ severity: 'error', summary: 'Connection Error', detail: 'Could not start the process on the server.', life: 5000 });
                    setIsQueryExecuting(false);
                    setShowProgressDialog(false);
                }
            });
        } else {
            toast.current.show({ severity: 'error', summary: 'Not Connected', detail: 'Not connected to the server. Please wait or refresh.', life: 5000 });
        }
    };

    // --- RENDER HELPERS ---

    // Renders the footer for the progress dialog.
    const renderProgressDialogFooter = () => (
        <div><Button label="Close" icon="pi pi-times" onClick={() => setShowProgressDialog(false)} className="p-button-text" disabled={isQueryExecuting} /></div>
    );

    // --- RENDER ---

    return (
        <>
            <div>
                <MyMenu />
                <div className="col-12"><h1 className="m-3">Range Query</h1><Divider /></div>
                <Panel header="Range Query Generator" toggleable>
                    <Toast ref={toast} />
                    {/* Switch to toggle between manual input and CSV upload */}
                    <div className="flex align-items-center mb-4">
                        <InputSwitch checked={useCsvUpload} onChange={e => setUseCsvUpload(e.value)} />
                        <label htmlFor="csvSwitch" className="ml-2">Upload CSV File</label>
                    </div>
                    
                    {/* Display for the currently selected folder */}
                    <div className="mb-3">
                        <p className="font-bold">Current selected dataset folder: <span style={{ color: selectedFolder ? '#5cb85c' : '#dc3545' }}>{selectedFolder || 'No folder selected'}</span></p>
                        {selectedFolder && selectedFolderBaseDir !== 'parent_dir_dataset' && (
                            <p style={{ color: '#dc3545', fontSize: '0.8rem' }}>Warning: Selected folder is not from '1. Generator'. Datasets will not be available.</p>
                        )}
                    </div>

                    {/* Manual query input form */}
                    {!useCsvUpload ? (
                        <>
                            <div className="pt-4 flex flex-wrap gap-3">
                                <FloatLabel>
                                    <Dropdown
                                        inputId="datasetName" value={selectedDatasetForQuery}
                                        options={availableDatasetsInFolder} onChange={(e) => setSelectedDatasetForQuery(e.value)}
                                        placeholder={!selectedFolder ? "Select a folder first" : (selectedFolderBaseDir !== 'parent_dir_dataset' ? "Not a dataset folder" : (availableDatasetsInFolder.length > 0 ? "Select a Dataset" : "No datasets in folder"))}
                                        filter className="w-full md:w-14rem"
                                        disabled={!selectedFolder || availableDatasetsInFolder.length === 0 || selectedFolderBaseDir !== 'parent_dir_dataset'}
                                    />
                                    <label htmlFor="datasetName">Dataset Name</label>
                                </FloatLabel>
                                <FloatLabel><InputNumber inputId="numQuery" value={numQuery} onValueChange={(e) => setNumQuery(e.value)} /><label htmlFor="numQuery">Num Queries</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="queryArea" value={queryArea} onValueChange={(e) => setQueryArea(e.value)} /><label htmlFor="queryArea">Query Area</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="minX" value={minX} onValueChange={(e) => setMinX(e.value)} /><label htmlFor="minX">Min X</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="minY" value={minY} onValueChange={(e) => setMinY(e.value)} /><label htmlFor="minY">Min Y</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="maxX" value={maxX} onValueChange={(e) => setMaxX(e.value)} /><label htmlFor="maxX">Max X</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="maxY" value={maxY} onValueChange={(e) => setMaxY(e.value)} /><label htmlFor="maxY">Max Y</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="areaint" value={areaint} onValueChange={(e) => setAreaint(e.value)} /><label htmlFor="areaint">Area Intersection</label></FloatLabel>
                                <div className='flex justify-content-end flex-wrap'><Button onClick={insertQuery} disabled={!selectedFolder || selectedFolderBaseDir !== 'parent_dir_dataset'}>Insert Query</Button></div>
                                <div className="flex justify-content-end flex-wrap"><Button onClick={generateQueries} disabled={!selectedFolder || selectedFolderBaseDir !== 'parent_dir_dataset' || queries.length === 0}>Submit</Button></div>
                            </div>
                            <div className="pt-3">
                                <DataTable value={queries} showGridlines tableStyle={{ minWidth: '50rem' }}>
                                    {columns.map((col, i) => (<Column key={col.field || i} field={col.field} header={col.header} body={col.body} />))}
                                </DataTable>
                            </div>
                        </>
                    ) : (
                        // CSV upload section
                        <div className='pt-2 flex flex-wrap gap-3'>
                            <FileUpload mode="basic" accept=".csv" chooseLabel="Choose CSV" onSelect={handleCsvFileUpload} auto={false} />
                            <div className='flex justify-content-end flex-wrap'><Button onClick={generateQueriesCsv} disabled={!selectedFolder || selectedFolderBaseDir !== 'parent_dir_dataset' || !csvFile}>Submit CSV File</Button></div>
                        </div>
                    )}

                    {/* Output and status section */}
                    <div className="pt-3">
                        <Divider />
                        {outputFolderName && <p className="font-bold text-green-600">Results saved in folder: {outputFolderName}</p>}
                        {inputCsvFileName && (<p className="text-sm text-gray-500">Input Parameters saved as: {inputCsvFileName}</p>)}
                        {error && <p className="text-red-500">{error}</p>}
                    </div>
                </Panel>
            </div>

            {/* File explorer for folder selection */}
            <div className='pt-2'>
                <FileExplorer onFolderSelect={handleFolderSelect} />
            </div>

            {/* Progress dialog including CPU and RAM bars */}
            <Dialog header="Range Query Execution State" visible={showProgressDialog} style={{ width: '50vw' }} onHide={() => !isQueryExecuting && setShowProgressDialog(false)} closable={!isQueryExecuting} footer={renderProgressDialogFooter}>
                <p>{queryProgressMessage}</p>
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
                {isQueryExecuting && <p className="mt-3">The Range Query execution may take some time...</p>}
            </Dialog>
        </>
    );
}

export default RangeQuery;
