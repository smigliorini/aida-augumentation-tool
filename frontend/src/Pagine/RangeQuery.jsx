import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Panel } from 'primereact/panel';
import { FloatLabel } from 'primereact/floatlabel';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext'; // Imported for cell editing
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Toast } from 'primereact/toast';
import MyMenu from '../Components/MyMenu';
import { Divider } from 'primereact/divider';
import { FileUpload } from 'primereact/fileupload';
import { InputSwitch } from 'primereact/inputswitch';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton'; // Added for mode selection
import FileExplorer from '../Components/FileExplorer';
// Import the centralized socket instance and API base URL.
import { socket, API_BASE_URL } from '../socket';


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
    
    // New state for Random Window generation mode
    const [lengthX, setLengthX] = useState(null);
    const [lengthY, setLengthY] = useState(null);

    const [areaint, setAreaint] = useState(1); //TEMP: fixed input

    // State to toggle between "Manual Coordinates" and "Random Window" modes
    const [queryMode, setQueryMode] = useState('manual'); // 'manual' or 'random'
    const queryModes = [
        { label: 'Manual Coordinates', value: 'manual' },
        { label: 'Random Window', value: 'random' }
    ];

    // State for managing the list of queries to be executed.
    const [queries, setQueries] = useState([]);

    // State for handling server communication and UI feedback.
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);
    const toast = useRef(null);

    // State for CSV upload functionality.
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

    // --- HELPER FUNCTIONS ---

    // Helper to render number editor for DataTable cells
    const numberEditor = (options) => {
        return <InputNumber value={options.value} onValueChange={(e) => options.editorCallback(e.value)} mode="decimal" minFractionDigits={0} maxFractionDigits={10} />;
    };

    // Helper to render text editor for DataTable cells
    const textEditor = (options) => {
        return <InputText type="text" value={options.value} onChange={(e) => options.editorCallback(e.target.value)} />;
    };

    // Callback when a cell is edited in the DataTable
    const onCellEditComplete = (e) => {
        let _queries = [...queries];
        let { rowData, newValue, field, originalEvent } = e;

        // Basic validation or type conversion if needed
        if (newValue !== undefined && newValue !== null) {
            rowData[field] = newValue;
        } else {
             originalEvent.preventDefault(); // Reject empty updates if strictly required
        }

        setQueries(_queries);
    };

    // Renders the action buttons (Duplicate and Delete) for each row.
    const actionBodyTemplate = (rowData) => {
        return (
            <div className="flex gap-2">
                <Button 
                    icon="pi pi-copy" 
                    className="p-button-secondary p-button-sm" 
                    onClick={() => handleDuplicate(rowData)} 
                    tooltip="Duplicate this row"
                    tooltipOptions={{ position: 'top' }}
                />
                <Button 
                    icon="pi pi-trash" 
                    className="p-button-danger p-button-sm" 
                    onClick={() => handleDelete(rowData)} 
                    tooltip="Delete"
                    tooltipOptions={{ position: 'top' }}
                />
            </div>
        );
    };

    // --- COMPONENT CONFIGURATION ---

    // Define columns dynamically based on the selected mode
    const getColumns = () => {
        const commonColumns = [
            { field: 'datasetName', header: 'Dataset Name', editor: (options) => textEditor(options) },
            { field: 'numQuery', header: 'Number of Queries', editor: (options) => numberEditor(options) },
        ];

        if (queryMode === 'manual') {
            return [
                ...commonColumns,
                { field: 'queryArea', header: 'Query Area', editor: (options) => numberEditor(options) },
                { field: 'minX', header: 'Min X', editor: (options) => numberEditor(options) }, 
                { field: 'minY', header: 'Min Y', editor: (options) => numberEditor(options) },
                { field: 'maxX', header: 'Max X', editor: (options) => numberEditor(options) }, 
                { field: 'maxY', header: 'Max Y', editor: (options) => numberEditor(options) },
                { header: 'Actions', body: actionBodyTemplate }
            ];
        } else {
            // Random Window Mode Columns
            return [
                ...commonColumns,
                { field: 'lengthX', header: 'Length X', editor: (options) => numberEditor(options) },
                { field: 'lengthY', header: 'Length Y', editor: (options) => numberEditor(options) },
                { header: 'Actions', body: actionBodyTemplate }
            ];
        }
    };

    const downloadCsvTemplate = () => {
        const csvContent = `datasetName;numQuery;queryArea;minX;minY;maxX;maxY;areaint;cardinality;executionTime;mbrTests;cardinality_class
dataset1;1;0.02;1.07;5.66;1.09;5.69;0.49;3.07;52;4;0.0-0.031
dataset1;2;0.03;1.52;6.45;1.53;6.48;0.49;3.29;50;4;0.0-0.0323
dataset1;3;0.04;0.87;5.80;0.89;5.82;0.49;3.28;43;3;0.0-0.0312`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "rq_input_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- DATA FETCHING ---

    // Fetches the list of available datasets from a selected folder to populate the dropdown.
    const fetchDatasetsForDropdown = useCallback(async (folderName, parentDir) => {
        if (parentDir !== 'parent_dir_dataset') {
            setAvailableDatasetsInFolder([]);
            setSelectedDatasetForQuery(null);
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/explorer/content?path=${parentDir}/${folderName}`);
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

    // Auto-calculate Area in Manual Mode
    useEffect(() => {
        if (queryMode === 'manual' && minX !== null && maxX !== null && minY !== null && maxY !== null && maxX > minX && maxY > minY) {
            const area = (maxX - minX) * (maxY - minY);
            setQueryArea(area);
        } else {
            setQueryArea(null);
        }
    }, [minX, maxX, minY, maxY, queryMode]);

    // Effect hook to manage the WebSocket connection.
    useEffect(() => {
        socket.connect();
        
        // Listens for query progress updates from the server.
        socket.on('range_query_progress', (data) => {
            setProgress(data.progress);
            setQueryProgressMessage(`Processed: ${data.current_dataset} (${data.processed_count}/${data.total_count})`);
            if (!showProgressDialog) setShowProgressDialog(true);
        });

        // Listens for real-time CPU and RAM data.
        socket.on('resource_usage', (data) => {
            setCpuUsage(data.cpu);
            setRamUsage(data.ram);
        });
    
        // Handles query generation errors from the server.
        socket.on('generate_query_error', (data) => {
            toast.current.show({ severity: 'error', summary: 'Error', detail: data.error, life: 5000 });
            setIsQueryExecuting(false);
            setShowProgressDialog(false);
            setCpuUsage(0); // Reset on error.
            setRamUsage(0); // Reset on error.
        });
    
        // Handles the completion of the query generation process.
        socket.on('generate_query_complete', (data) => {
            toast.current.show({ severity: 'success', summary: 'Success', detail: 'Range Query completed successfully!', life: 5000 });
            setIsQueryExecuting(false);
            setOutputFolderName(data.output_folder_name);
            setShowProgressDialog(false);
            setCpuUsage(0); // Reset on completion.
            setRamUsage(0); // Reset on completion.
        });
    
        // Cleanup function to disconnect the socket when the component unmounts.
        return () => {
            socket.disconnect();
        };
    }, []);

    // Handles the selection of a CSV file for upload and PARSES it immediately.
    const handleCsvFileUpload = (event) => {
        const file = event.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                try {
                    // Simple semicolon CSV parser
                    const lines = text.split(/\r?\n/);
                    const headers = lines[0].split(';').map(h => h.trim());
                    
                    const parsedQueries = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        if (!lines[i].trim()) continue; // Skip empty lines
                        const values = lines[i].split(';');
                        const row = {};
                        
                        headers.forEach((header, index) => {
                            let value = values[index]?.trim();
                            // Convert numeric values
                            if (!isNaN(value) && value !== '') {
                                value = parseFloat(value);
                            }
                            row[header] = value;
                        });
                        
                        // Ensure essential fields exist
                        if (row.datasetName) {
                            parsedQueries.push(row);
                        }
                    }

                    // Update state with parsed queries
                    setQueries(prev => [...prev, ...parsedQueries]);
                    setInputCsvFileName(file.name);
                    
                    toast.current.show({ severity: 'success', summary: 'CSV Imported', detail: `Imported ${parsedQueries.length} queries to the table. You can now edit them below.`, life: 5000 });
                    
                    // Switch back to manual mode to show the table
                    setUseCsvUpload(false);
                    // Force manual mode if CSV is loaded (since CSV structure usually matches manual input)
                    setQueryMode('manual');
                    
                } catch (err) {
                    console.error("CSV Parsing Error", err);
                    toast.current.show({ severity: 'error', summary: 'Parsing Error', detail: 'Could not parse the CSV file.', life: 5000 });
                }
            };
            reader.readAsText(file); // Read as text, not DataURL
        }
    };

    // Validates inputs and adds the current query configuration to the table.
    const insertQuery = () => {
        if (!selectedDatasetForQuery || numQuery === null) {
             toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please select a dataset and fill number of queries.', life: 5000 });
             return;
        }

        let newQuery = {};

        if (queryMode === 'manual') {
            if (minX === null || minY === null || maxX === null || maxY === null) {
                toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please fill all coordinate fields.', life: 5000 });
                return;
            }
            newQuery = { datasetName: selectedDatasetForQuery, numQuery, queryArea, minX, minY, maxX, maxY, areaint };
        } else {
            // Random mode
            if (lengthX === null || lengthY === null) {
                toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please fill Length X and Length Y.', life: 5000 });
                return;
            }
            newQuery = { datasetName: selectedDatasetForQuery, numQuery, lengthX, lengthY, areaint };
        }

        setQueries([...queries, newQuery]);
        
        // Reset input fields
        setSelectedDatasetForQuery(null); setNumQuery(null); 
        if (queryMode === 'manual') {
            setQueryArea(null); setMinX(null); setMinY(null); setMaxX(null); setMaxY(null);
        } else {
            setLengthX(null); setLengthY(null);
        }
    };

    // Populates the table with one row for every dataset available in the selected folder.
    const populateWithDatasets = () => {
        if (!availableDatasetsInFolder || availableDatasetsInFolder.length === 0) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'No datasets available in the selected folder.', life: 5000 });
            return;
        }

        // Create a new query row for each dataset found based on the current mode.
        const newQueries = availableDatasetsInFolder.map(ds => {
            if (queryMode === 'manual') {
                return {
                    datasetName: ds.value,
                    numQuery: 1,      // Default number of queries
                    queryArea: 0.01,  // Default area
                    minX: 0,          // Placeholder
                    minY: 0, 
                    maxX: 0, 
                    maxY: 0, 
                    areaint: 1
                };
            } else {
                return {
                    datasetName: ds.value,
                    numQuery: 1,      // Default number of queries to generate
                    lengthX: 0.1,     // Default Length X
                    lengthY: 0.1,     // Default Length Y
                    areaint: 1
                };
            }
        });

        // Append new queries to the existing list.
        setQueries(prev => [...prev, ...newQueries]);
        toast.current.show({ severity: 'success', summary: 'Populated', detail: `Added ${newQueries.length} datasets to the table in ${queryMode} mode.`, life: 3000 });
    };

    // Removes a query from the table.
    const handleDelete = (rowData) => {
        setQueries(queries.filter(q => q !== rowData));
    };

    // Duplicates a specific row in the table.
    const handleDuplicate = (rowData) => {
        // Create a shallow copy of the row data
        const duplicatedRow = { ...rowData };
        setQueries(prev => [...prev, duplicatedRow]);
        toast.current.show({ severity: 'info', summary: 'Duplicated', detail: 'Row duplicated.', life: 2000 });
    };

    // Clears all queries from the table.
    const clearAllQueries = () => {
        setQueries([]);
        toast.current.show({ severity: 'info', summary: 'Cleared', detail: 'All queries have been removed.', life: 3000 });
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

    // Sends the queries to the server.
    const generateQueries = () => {
        if (queries.length === 0) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Add at least one query to the table.', life: 5000 });
            return;
        }
        
        if (socket.connected) {
            startQueryExecution();
            // Send queries, folder, AND the current mode
            socket.emit('generate_queries', { queries, folder: selectedFolder, mode: queryMode }, (response) => {
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

    // Copies the values from the last inserted query into the input fields.
    const copyLastQuery = () => {
        if (queries.length === 0) {
            toast.current.show({ severity: 'info', summary: 'Info', detail: 'No queries in the table to copy.', life: 3000 });
            return;
        }

        const lastQuery = queries[queries.length - 1];

        // Check compatibility with current mode
        const isManualQuery = lastQuery.hasOwnProperty('minX');
        const isRandomQuery = lastQuery.hasOwnProperty('lengthX');

        if ((queryMode === 'manual' && !isManualQuery) || (queryMode === 'random' && !isRandomQuery)) {
             toast.current.show({ severity: 'warn', summary: 'Mismatch', detail: 'Last query type does not match current mode.', life: 3000 });
             return;
        }

        // Set state for all form fields using values from the last query.
        setSelectedDatasetForQuery(lastQuery.datasetName);
        setNumQuery(lastQuery.numQuery);
        setAreaint(lastQuery.areaint);

        if (queryMode === 'manual') {
            setQueryArea(lastQuery.queryArea);
            setMinX(lastQuery.minX);
            setMinY(lastQuery.minY);
            setMaxX(lastQuery.maxX);
            setMaxY(lastQuery.maxY);
        } else {
            setLengthX(lastQuery.lengthX);
            setLengthY(lastQuery.lengthY);
        }
        
        toast.current.show({ severity: 'success', summary: 'Copied', detail: 'Last query values have been copied to the form.', life: 3000 });
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
                    
                    {/* Header Controls: Switch for CSV, Mode Selection */}
                    <div className="flex align-items-center flex-wrap gap-5 mb-4">
                        <div className="flex align-items-center">
                            <InputSwitch checked={useCsvUpload} onChange={e => setUseCsvUpload(e.value)} />
                            <label htmlFor="csvSwitch" className="ml-2">Upload CSV File</label>
                        </div>
                        
                        {!useCsvUpload && (
                            <div className="flex align-items-center">
                                <label className="mr-2 font-bold">Generation Mode:</label>
                                <SelectButton value={queryMode} onChange={(e) => { if (e.value) { setQueryMode(e.value); setQueries([]); } }} options={queryModes} />
                            </div>
                        )}
                    </div>

                    {/* Manual query input form - SHOWN ALSO FOR PREVIEW AFTER CSV UPLOAD */}
                    {!useCsvUpload ? (
                        <>
                            <Message 
                                severity={"warn"} 
                                text={"Please select a folder from the '1. Generator' section in the explorer below."} 
                                className="w-full justify-content-center mb-3" 
                            />
                            {/* Display for the currently selected folder */}
                            <div className="mb-3">
                                <p className="font-bold">Current selected dataset folder: <span style={{ color: selectedFolder ? '#5cb85c' : '#dc3545' }}>{selectedFolder || 'No folder selected'}</span></p>
                                {selectedFolder && selectedFolderBaseDir !== 'parent_dir_dataset' && (
                                    <p style={{ color: '#dc3545', fontSize: '0.8rem' }}>Warning: Selected folder is not from '1. Generator'. Datasets will not be available.</p>
                                )}
                            </div>
                            
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
                                <FloatLabel><InputNumber inputId="numQuery" value={numQuery} onValueChange={(e) => setNumQuery(e.value)} min={1}/><label htmlFor="numQuery">{queryMode === 'random' ? 'Num Queries to Generate' : 'Num Queries'}</label></FloatLabel>

                                {/* Conditional Inputs based on Mode */}
                                {queryMode === 'manual' ? (
                                    <>
                                        <FloatLabel><InputNumber inputId="minX" value={minX} onValueChange={(e) => setMinX(e.value)} minFractionDigits={0} maxFractionDigits={10}/><label htmlFor="minX">Min X</label></FloatLabel>
                                        <FloatLabel><InputNumber inputId="minY" value={minY} onValueChange={(e) => setMinY(e.value)} minFractionDigits={0} maxFractionDigits={10}/><label htmlFor="minY">Min Y</label></FloatLabel>
                                        <FloatLabel><InputNumber inputId="maxX" value={maxX} onValueChange={(e) => setMaxX(e.value)} minFractionDigits={0} maxFractionDigits={10}/><label htmlFor="maxX">Max X</label></FloatLabel>
                                        <FloatLabel><InputNumber inputId="maxY" value={maxY} onValueChange={(e) => setMaxY(e.value)} minFractionDigits={0} maxFractionDigits={10}/><label htmlFor="maxY">Max Y</label></FloatLabel>
                                        <FloatLabel><InputNumber inputId="queryArea" value={queryArea} disabled /><label htmlFor="queryArea">Query Area (Calc)</label></FloatLabel>
                                    </>
                                ) : (
                                    <>
                                        <FloatLabel><InputNumber inputId="lengthX" value={lengthX} onValueChange={(e) => setLengthX(e.value)} minFractionDigits={0} maxFractionDigits={10} /><label htmlFor="lengthX">Length X (Window Width)</label></FloatLabel>
                                        <FloatLabel><InputNumber inputId="lengthY" value={lengthY} onValueChange={(e) => setLengthY(e.value)} minFractionDigits={0} maxFractionDigits={10} /><label htmlFor="lengthY">Length Y (Window Height)</label></FloatLabel>
                                    </>
                                )}

                                {/* Action buttons group */}
                                <div className="flex justify-content-end flex-wrap gap-2 w-full mt-3">
                                    <Button 
                                        onClick={clearAllQueries} 
                                        disabled={queries.length === 0} 
                                        icon="pi pi-trash" 
                                        label="Clear All" 
                                        className="p-button-danger p-button-outlined" 
                                        tooltip="Remove all queries from the table"
                                    />
                                    {/* New Button to populate table from folder content */}
                                    <Button 
                                        onClick={populateWithDatasets} 
                                        disabled={!selectedFolder || availableDatasetsInFolder.length === 0} 
                                        icon="pi pi-table" 
                                        label="Populate from Folder" 
                                        className="p-button-info p-button-outlined" 
                                        tooltip="Auto-fill table with all datasets in folder"
                                    />
                                    <Button 
                                        onClick={copyLastQuery} 
                                        disabled={queries.length === 0} 
                                        icon="pi pi-copy" 
                                        tooltip="Copy Last Query" 
                                        className="p-button-secondary" 
                                    />
                                    <Button 
                                        onClick={insertQuery} 
                                        disabled={!selectedFolder || selectedFolderBaseDir !== 'parent_dir_dataset'}
                                        label="Insert Query"
                                    />
                                    <Button 
                                        onClick={generateQueries} 
                                        disabled={!selectedFolder || selectedFolderBaseDir !== 'parent_dir_dataset' || queries.length === 0}
                                        label="Submit"
                                    />
                                </div>
                            </div>
                            <div className="pt-3">
                                {/* Enabled cell editing (editMode="cell") to allow data modification */}
                                {/* Dynamic Columns based on Mode */}
                                <DataTable value={queries} showGridlines tableStyle={{ minWidth: '50rem' }} editMode="cell" onCellEditComplete={onCellEditComplete} paginator rows={15} rowsPerPageOptions={[5, 10, 15, 25, 50, 100]}>
                                    {getColumns().map((col, i) => (
                                        <Column key={col.field || i} field={col.field} header={col.header} body={col.body} editor={col.editor} onCellEditComplete={onCellEditComplete}/>
                                    ))}
                                </DataTable>
                                <p className="text-sm text-gray-500 mt-2">* Click on a cell to edit its value.</p>
                            </div>
                        </>
                    ) : (
                        // CSV upload section
                        <div className='pt-4'>
                            <div className='pb-3'>
                                <p className="m-0">Upload a CSV file to populate the table. You can then preview and edit the data before submission.</p>
                                <p className="m-0" style={{ fontSize: '18px', fontWeight: 'bold', color: '#9FDAA8' }}>IMPORTANT: Dataset names must not contain special characters, always as name1, box2, first3, ecc...</p>
                            </div>
                            <div className='flex flex-wrap gap-3'>
                                {/* Use standard FileUpload but handle with custom parser logic */}
                                <FileUpload mode="basic" accept=".csv" chooseLabel="Choose CSV" onSelect={handleCsvFileUpload} auto={true}/>
                                <Button onClick={downloadCsvTemplate} label="Download CSV Template" icon="pi pi-download" className="p-button-secondary"/>
                            </div>
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