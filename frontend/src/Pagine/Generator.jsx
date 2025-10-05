import React, { useEffect, useRef, useState } from 'react';
import { Panel } from 'primereact/panel';
import { Dropdown } from 'primereact/dropdown';
import { FloatLabel } from 'primereact/floatlabel';
import { InputNumber } from 'primereact/inputnumber';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Toast } from 'primereact/toast';
import MyMenu from '../Components/MyMenu';
import { Divider } from 'primereact/divider';
import { FileUpload } from 'primereact/fileupload';
import { InputSwitch } from 'primereact/inputswitch';
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import FileExplorer from '../Components/FileExplorer';
// Import the centralized socket instance.
import { socket } from '../socket';


// Main component for the data generation UI.
function Generator() {
    // --- STATE MANAGEMENT ---

    // State for generator input parameters.
    const [distribution, setDistribution] = useState(null);
    const [geometry, setGeometry] = useState(null);
    const [cardinality, setCardinality] = useState(null);
    // Dimensions is hardcoded to 2.
    const [dimensions] = useState(2);
    const [format, setFormat] = useState(null);
    
    // Renamed states to align with CSV column names for consistency.
    const [avgSideLength0, setAvgSideLength0] = useState(null); // Was boxMaxSizeX
    const [avgSideLength1, setAvgSideLength1] = useState(null); // Was boxMaxSizeY
    const [avgArea, setAvgArea] = useState(null);               // Was pointPolySize
    const [maxSeg, setMaxSeg] = useState(null);                 // Was pointMaxSeg

    // State for E0 and E2 parameters.
    const [e0, setE0] = useState(null);
    const [e2, setE2] = useState(null);

    const [diagPercentage, setDiagPercentage] = useState(null);
    const [diagBuffer, setDiagBuffer] = useState(null);
    const [parcSrange, setParcSrange] = useState(null);
    const [parcDither, setParcDither] = useState(null);
    const [affineMatrix, setAffineMatrix] = useState('');
    const [compress, setCompress] = useState(false);
    const [bitPropability, setBitProbability] = useState(null);
    const [bitDigits, setBitDigits] = useState(null);
    const [seed, setSeed] = useState(null);

    // State for the bounding box coordinates.
    const [x1, setX1] = useState(null);
    const [y1, setY1] = useState(null);
    const [x2, setX2] = useState(null);
    const [y2, setY2] = useState(null);
    
    // State for managing datasets to be generated.
    const [datasets, setDatasets] = useState([]);
    const [idCounter, setIdCounter] = useState(1); // Used to assign a unique key to each dataset row.

    // State for handling server communication and UI feedback.
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // The local socket state is no longer needed; we use the imported 'socket' instance directly.
    // const [socket, setSocket] = useState(null);
    const [progress, setProgress] = useState(0);
    const toast = useRef(null);
    const [canDownload, setCanDownload] = useState(false);
    const [fileName, setFilename] = useState(null);
    const [inputCsvFileName, setInputCsvFileName] = useState(null);
    
    // State for CSV upload functionality.
    const [csvFile, setCsvFile] = useState(null);
    const [useCsvUpload, setUseCsvUpload] = useState(false);

    // State for enabling expert user mode.
    const [isExpertMode, setIsExpertMode] = useState(false);

    // State for file explorer and output directory.
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [selectedFolderParentDir, setSelectedFolderParentDir] = useState(null);

    // State for system resource monitoring.
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);

    // State to control the visibility of the progress popup.
    const [isProgressDialogVisible, setIsProgressDialogVisible] = useState(false);

    // --- COMPONENT CONFIGURATION ---

    // Defines the columns for the datasets table, including E0 and E2.
    const columns = [
        { field: 'distribution', header: 'Distribution' }, { field: 'x1', header: 'X1' },
        { field: 'y1', header: 'Y1' }, { field: 'x2', header: 'X2' }, { field: 'y2', header: 'Y2' },
        { field: 'cardinality', header: 'Cardinality' },
        { field: 'maxsize', header: 'avg_side_lengths' }, { field: 'polysize', header: 'avg_area' },
        { field: 'maxseg', header: 'max_seg' },
        { field: 'E0', header: 'E0' }, { field: 'E2', header: 'E2' }, // New columns
        {
            header: 'Actions',
            body: (rowData) => (<Button icon="pi pi-trash" className="p-button-danger" onClick={() => handleDelete(rowData)} />)
        }
    ];

    // Maps distribution-geometry combinations to their specific input fields.
    // The input field for max_seg is now only shown for Polygon.
    const dependentFieldsMap = {
        'Uniform-Point': [], 'Uniform-Box': [], 'Uniform-Polygon': ['maxSeg'],
        'Diagonal-Point': ['diagPercentage', 'diagBuffer'], 'Diagonal-Box': ['diagPercentage', 'diagBuffer'], 'Diagonal-Polygon': ['diagPercentage', 'diagBuffer', 'maxSeg'],
        'Gaussian-Point': [], 'Gaussian-Box': [], 'Gaussian-Polygon': ['maxSeg'],
        'Parcel-Box': ['parcSrange', 'parcDither'], 'Parcel-Polygon': ['parcSrange', 'parcDither'],
        'Bit-Point': ['bitPropability', 'bitDigits'], 'Bit-Box': ['bitPropability', 'bitDigits'], 'Bit-Polygon': ['bitPropability', 'bitDigits', 'maxSeg'],
        'Sierpinski-Point': [], 'Sierpinski-Box': [], 'Sierpinski-Polygon': ['maxSeg'],
    };

    // Options for the main dropdown menus.
    const typeDistribution = [{ name: 'Uniform' }, { name: 'Diagonal' }, { name: 'Gaussian' }, { name: 'Parcel' }, { name: 'Bit' }, { name: 'Sierpinski' }];
    const typeGeometry = [{ name: 'Point' }, { name: 'Box' }, { name: 'Polygon' }];

    // --- EVENT HANDLERS & LOGIC ---

    // Callback for when a folder is selected in the FileExplorer component.
    const handleFolderSelect = (folderName, parentDir) => {
        setSelectedFolder(folderName);
        setSelectedFolderParentDir(parentDir);
    };

    // Resets dependent fields when the distribution type changes.
    const onDistributionChange = (e) => {
        const selectedDistribution = e.value;
        setDistribution(selectedDistribution);
        // Clear all optional fields to ensure a clean state.
        setDiagPercentage(null); setDiagBuffer(null); setParcSrange(null); setParcDither(null);
        setBitProbability(null); setBitDigits(null); 
        setAvgSideLength0(null); setAvgSideLength1(null); setAvgArea(null); setMaxSeg(null);
        setE0(null); setE2(null);
    };

    // Resets fields and sets the default format when the geometry type changes.
    const onGeometryChange = (e) => {
        const selectedGeometry = e.value;
        setGeometry(selectedGeometry);
        // maxSeg is now the only one that depends directly on geometry change
        setMaxSeg(null);
        
        // Automatically set the format based on the selected geometry.
        if (selectedGeometry && selectedGeometry.name === 'Polygon') {
            setFormat({ name: 'wkt' });
        } else if (selectedGeometry && (selectedGeometry.name === 'Point' || selectedGeometry.name === 'Box')) {
            setFormat({ name: 'csv' });
        } else {
            setFormat(null);
        }
    };
    
    // Renamed handlers for clarity
    const handleAvgSideLength0Change = (e) => setAvgSideLength0(e.value !== null ? parseFloat(e.value) : null);
    const handleAvgSideLength1Change = (e) => setAvgSideLength1(e.value !== null ? parseFloat(e.value) : null);

    // Effect hook to manage the WebSocket connection.
    useEffect(() => {
        // Connect the imported socket instance when the component mounts.
        socket.connect();
        
        // Listens for progress updates from the server.
        socket.on('progress', (data) => setProgress(data.progress));
        
        // Listens for resource usage updates.
        socket.on('resource_usage', (data) => {
            setCpuUsage(data.cpu);
            setRamUsage(data.ram);
        });

        // Handles generation errors from the server.
        socket.on('generate_data_error', (data) => {
            setError(data.error); setLoading(false); setProgress(0); setCpuUsage(0); setRamUsage(0);
            setIsProgressDialogVisible(false); // Hide dialog on error.
            if (toast.current) toast.current.show({ severity: 'error', summary: 'Error', detail: data.error, life: 5000 });
        });

        // Handles the completion of the generation process.
        socket.on('generate_data_complete', (data) => {
            setFilename(data.dataset_id); setInputCsvFileName(data.input_csv_file);
            setLoading(false); setProgress(100); setCanDownload(true);
            setIsProgressDialogVisible(false); // Hide dialog on completion.
            // Reset resource usage display shortly after completion.
            setTimeout(() => {
                setCpuUsage(0);
                setRamUsage(0);
            }, 500);
        });

        // Cleanup function to disconnect the socket when the component unmounts.
        return () => { socket.disconnect(); };
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

    // Validates inputs and adds the current dataset configuration to the table.
    const insertDataset = () => {
        // Ensure all required fields are filled.
        if (!distribution || !cardinality || !dimensions || !geometry || !format || x1 === null || y1 === null || x2 === null || y2 === null) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please fill all required fields.', life: 5000 });
            return;
        }

        // Validation for maxSeg with Polygons.
        if (geometry.name === 'Polygon' && maxSeg !== null && maxSeg < 4) {
            toast.current.show({ severity: 'error', summary: 'Validation Error', detail: 'max_seg must be 4 or greater for Polygons.', life: 5000 });
            return;
        }

        const newId = idCounter;

        // Build the dataset object with all common parameters.
        const dataToSend = {
            id: newId,
            distribution: distribution.name.toLowerCase(),
            cardinality: parseInt(cardinality, 10),
            dimensions: parseInt(dimensions, 10),
            geometry: geometry.name.toLowerCase(),
            format: format.name.toLowerCase(),
            x1: x1, y1: y1, x2: x2, y2: y2,
        };

        // Add universal and optional parameters.
        if (avgSideLength0 !== null && avgSideLength1 !== null) dataToSend.maxsize = `${avgSideLength0.toFixed(1)},${avgSideLength1.toFixed(1)}`;
        if (avgArea !== null) dataToSend.polysize = avgArea;
        if (e0 !== null) dataToSend.E0 = e0;
        if (e2 !== null) dataToSend.E2 = e2;
        
        // Hybrid logic for max_seg.
        switch (dataToSend.geometry) {
            case 'point':
                dataToSend.maxseg = 1; // Hardcode to 1 for Points
                break;
            case 'box':
                dataToSend.maxseg = 4; // Hardcode to 4 for Boxes
                break;
            case 'polygon':
                if (maxSeg !== null) { // Use user input for Polygons
                    dataToSend.maxseg = maxSeg;
                }
                break;
            default:
                break;
        }
        
        // Add distribution-specific parameters. Use hardcoded defaults unless in Expert Mode.
        switch (dataToSend.distribution) {
            case 'diagonal':
                dataToSend.percentage = (isExpertMode && diagPercentage !== null) ? diagPercentage : 0.5;
                dataToSend.buffer = (isExpertMode && diagBuffer !== null) ? diagBuffer : 0.5;
                break;
            case 'bit':
                dataToSend.probability = (isExpertMode && bitPropability !== null) ? bitPropability : 0.2;
                dataToSend.digits = (isExpertMode && bitDigits !== null) ? bitDigits : 10;
                break;
            case 'parcel':
                dataToSend.srange = (isExpertMode && parcSrange !== null) ? parcSrange : 0.5;
                dataToSend.dither = (isExpertMode && parcDither !== null) ? parcDither : 0.5;
                break;
            default:
                break;
        }

        if (affineMatrix) dataToSend.affinematrix = affineMatrix;
        if (compress) dataToSend.compress = compress;
        if (seed) dataToSend.seed = seed;

        // Add the new dataset to the list and increment the ID counter.
        setDatasets([...datasets, dataToSend]);
        setIdCounter(prevId => prevId + 1);

        // Reset all input fields for the next entry.
        setDistribution(null); setGeometry(null); setCardinality(null);
        setFormat(null); setAvgSideLength0(null); setAvgSideLength1(null); setDiagPercentage(null);
        setDiagBuffer(null); setParcSrange(null); setParcDither(null); setAffineMatrix('');
        setCompress(false); setBitProbability(null); setBitDigits(null); setAvgArea(null);
        setMaxSeg(null); setSeed(null); setX1(null); setY1(null); setX2(null); setY2(null);
        setE0(null); setE2(null);
    };

    // Copies the values from the last inserted dataset into the input fields.
    const copyLastDataset = () => {
        if (datasets.length === 0) {
            toast.current.show({ severity: 'info', summary: 'Info', detail: 'No datasets to copy.', life: 3000 });
            return;
        }

        const lastDataset = datasets[datasets.length - 1];

        // Helper to capitalize first letter for dropdowns.
        const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

        // Set state for all fields from the last dataset, including E0/E2.
        setDistribution({ name: capitalize(lastDataset.distribution) });
        setGeometry({ name: capitalize(lastDataset.geometry) });
        setX1(lastDataset.x1);
        setY1(lastDataset.y1);
        setX2(lastDataset.x2);
        setY2(lastDataset.y2);
        setCardinality(lastDataset.cardinality);
        setSeed(lastDataset.seed || null);
        setFormat({ name: lastDataset.format });
        setDiagPercentage(lastDataset.percentage || null);
        setDiagBuffer(lastDataset.buffer || null);
        setParcSrange(lastDataset.srange || null);
        setParcDither(lastDataset.dither || null);
        setBitProbability(lastDataset.probability || null);
        setBitDigits(lastDataset.digits || null);
        setAvgArea(lastDataset.polysize || null);
        setMaxSeg(lastDataset.maxseg || null);
        setE0(lastDataset.E0 || null);
        setE2(lastDataset.E2 || null);
        setAffineMatrix(lastDataset.affinematrix || '');
        setCompress(lastDataset.compress || false);

        // Handle composite fields like maxsize.
        if (lastDataset.maxsize) {
            const [x, y] = lastDataset.maxsize.split(',');
            setAvgSideLength0(parseFloat(x));
            setAvgSideLength1(parseFloat(y));
        } else {
            setAvgSideLength0(null);
            setAvgSideLength1(null);
        }
        
        toast.current.show({ severity: 'success', summary: 'Copied', detail: 'Last dataset values have been copied to the form.', life: 3000 });
    };


    // Removes a dataset from the table.
    const handleDelete = (rowData) => {
        setDatasets(datasets.filter(item => item.id !== rowData.id));
    };

    // Resets the UI state before starting data generation.
    const startGeneration = () => {
        setLoading(true);
        setError(null);
        setResult('');
        setProgress(0);
        setCanDownload(false);
        setCpuUsage(0);
        setRamUsage(0);
        setIsProgressDialogVisible(true); // Show the progress popup.
    };

    // Sends the manually entered datasets to the server for generation.
    const generateData = () => {
        if (datasets.length === 0) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Add at least one dataset to the table.', life: 5000 });
            return;
        }
        startGeneration();
        // Remove the temporary 'id' field before sending to the server.
        const dataToSendToServer = datasets.map(({ id, ...rest }) => rest);
        // Use the imported socket instance to emit the event.
        socket.emit('generate_data', { datasets: dataToSendToServer, folder: selectedFolder });
    };

    // Sends the uploaded CSV file to the server for generation.
    const generateDataCsv = () => {
        if (!csvFile) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please upload a CSV file.', life: 3000 });
            return;
        }
        startGeneration();
        // Use the imported socket instance to emit the event.
        socket.emit('generate_data_from_csv', { csvFile: csvFile, folder: selectedFolder });
    };

    // --- RENDER ---
    
    return (
        <>
            <div>
                <MyMenu />
                <div className="col-12"><h1 className="m-3">Generator</h1><Divider /></div>
                <Panel header="Generator" toggleable>
                    <Toast ref={toast} />
                    {/* Switch to toggle between manual input and CSV upload */}
                    <div className="flex flex-wrap gap-4 align-items-center">
                        <div className="flex align-items-center">
                            <InputSwitch inputId="csvSwitch" checked={useCsvUpload} onChange={e => setUseCsvUpload(e.value)} />
                            <label htmlFor="csvSwitch" className="ml-2">Upload CSV File</label>
                        </div>
                        {/* Expert mode switch, only visible for manual input */}
                        {!useCsvUpload && (
                             <div className="flex align-items-center">
                                <InputSwitch inputId="expertSwitch" checked={isExpertMode} onChange={e => setIsExpertMode(e.value)} />
                                <label htmlFor="expertSwitch" className="ml-2">Enable Expert Mode</label>
                            </div>
                        )}
                    </div>

                    {/* Manual input form, shown when CSV upload is disabled */}
                    {!useCsvUpload && (
                        <>
                            <div className="pt-4 flex flex-wrap gap-3">
                                {/* Input fields for manual data generation */}
                                <FloatLabel><Dropdown inputId="distribution" value={distribution} onChange={onDistributionChange} options={typeDistribution} optionLabel="name" showClear className="w-10rem" variant="filled" /><label htmlFor="distribution">Distribution</label></FloatLabel>
                                <FloatLabel><Dropdown inputId="geometry" value={geometry} onChange={onGeometryChange} options={typeGeometry} optionLabel="name" showClear className="w-10rem" variant="filled" /><label htmlFor="geometry">Geometry</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="x1" value={x1} onChange={(e) => setX1(e.value)} variant="filled" /><label htmlFor="x1">X1</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="y1" value={y1} onChange={(e) => setY1(e.value)} variant="filled" /><label htmlFor="y1">Y1</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="x2" value={x2} onChange={(e) => setX2(e.value)} variant="filled" /><label htmlFor="x2">X2</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="y2" value={y2} onChange={(e) => setY2(e.value)} variant="filled" /><label htmlFor="y2">Y2</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="cardinality" value={cardinality} onChange={(e) => setCardinality(e.value)} variant="filled" /><label htmlFor="cardinality">Cardinality (#rows)</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="seed" value={seed} onChange={(e) => setSeed(e.value)} variant="filled" /><label htmlFor="seed">Seed</label></FloatLabel>
                                
                                {/* Universal fields, always visible */}
                                <FloatLabel><InputNumber inputId="avgSideLength0" value={avgSideLength0} onChange={handleAvgSideLength0Change} variant="filled" /><label htmlFor="avgSideLength0">avg_side_length_0</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="avgSideLength1" value={avgSideLength1} onChange={handleAvgSideLength1Change} variant="filled" /><label htmlFor="avgSideLength1">avg_side_length_1</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="avgArea" value={avgArea} onChange={(e) => setAvgArea(e.value)} variant="filled" /><label htmlFor="avgArea">avg_area</label></FloatLabel>
                                
                                {/* E0 and E2 fields, always visible */}
                                <FloatLabel><InputNumber inputId="e0" value={e0} onChange={(e) => setE0(e.value)} variant="filled" /><label htmlFor="e0">E0</label></FloatLabel>
                                <FloatLabel><InputNumber inputId="e2" value={e2} onChange={(e) => setE2(e.value)} variant="filled" /><label htmlFor="e2">E2</label></FloatLabel>
                                
                                {/* max_seg remains conditional and now has a minimum value. */}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('maxSeg') && <FloatLabel><InputNumber inputId="maxSeg" value={maxSeg} onChange={(e) => setMaxSeg(e.value)} min={3} variant="filled" /><label htmlFor="maxSeg">max_seg (min 3)</label></FloatLabel>}
                                
                                {/* Expert Mode fields. These are only visible when Expert Mode is enabled. */}
                                {isExpertMode && dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('diagPercentage') && <FloatLabel><InputNumber inputId="diagPercentage" value={diagPercentage} onChange={(e) => setDiagPercentage(e.value)} variant="filled" placeholder="Default: 0.5" /><label htmlFor="diagPercentage">Percentage</label></FloatLabel>}
                                {isExpertMode && dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('diagBuffer') && <FloatLabel><InputNumber inputId="diagBuffer" value={diagBuffer} onChange={(e) => setDiagBuffer(e.value)} variant="filled" placeholder="Default: 0.5" /><label htmlFor="diagBuffer">Buffer</label></FloatLabel>}
                                {isExpertMode && dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('parcSrange') && <FloatLabel><InputNumber inputId="parcSrange" value={parcSrange} onChange={(e) => setParcSrange(e.value)} variant="filled" placeholder="Default: 0.5" /><label htmlFor="parcSrange">Split Range</label></FloatLabel>}
                                {isExpertMode && dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('parcDither') && <FloatLabel><InputNumber inputId="parcDither" value={parcDither} onChange={(e) => setParcDither(e.value)} variant="filled" placeholder="Default: 0.5" /><label htmlFor="parcDither">Dither</label></FloatLabel>}
                                {isExpertMode && dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('bitPropability') && <FloatLabel><InputNumber inputId="bitPropability" value={bitPropability} onChange={(e) => setBitProbability(e.value)} variant="filled" placeholder="Default: 0.2" /><label htmlFor="bitPropability">Probability</label></FloatLabel>}
                                {isExpertMode && dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('bitDigits') && <FloatLabel><InputNumber inputId="bitDigits" value={bitDigits} onChange={(e) => setBitDigits(e.value)} variant="filled" placeholder="Default: 10" /><label htmlFor="bitDigits">Digits</label></FloatLabel>}
                                
                                {/* Action buttons */}
                                <div className='flex justify-content-end flex-wrap gap-2'>
                                    {/* Button to copy the last entered dataset for quick editing */}
                                    <Button onClick={copyLastDataset} disabled={datasets.length === 0} icon="pi pi-copy" tooltip="Copy Last Dataset" className="p-button-secondary" />
                                    <Button onClick={insertDataset}>Insert Dataset</Button>
                                    <Button onClick={generateData}>Submit</Button>
                                </div>
                            </div>
                            {/* Table to display the list of datasets to be generated */}
                            <div>
                                <DataTable value={datasets} showGridlines tableStyle={{ minWidth: '50rem' }} className='pt-3'>
                                    {columns.map((col, i) => (<Column key={col.field || i} field={col.field} header={col.header} body={col.body} />))}
                                </DataTable>
                            </div>
                        </>
                    )}
                    
                    {/* CSV upload section, shown when enabled */}
                    {useCsvUpload && (
                        <div className='pt-2 flex flex-wrap gap-3'>
                            <FileUpload mode="basic" accept=".csv" chooseLabel="Choose CSV" onSelect={handleCsvFileUpload} auto={false} />
                            <div className='flex justify-content-end flex-wrap'><Button onClick={generateDataCsv}>Submit CSV File</Button></div>
                        </div>
                    )}

                    {/* Output and status section */}
                    <div>
                        <Divider />
                        <div>{canDownload && <label style={{ fontSize: '18px', fontWeight: 'bold', color: '#9FDAA8' }}>{fileName}</label>}</div>
                        {inputCsvFileName && (<div className='pt-1'><label style={{ fontSize: '14px', color: 'grey' }}>Input Parameters saved as: {inputCsvFileName}</label></div>)}
                        {error && <p style={{ color: 'red' }}>{error}</p>}
                    </div>
                </Panel>
            </div>

            {/* File explorer component to select the output folder */}
            <div className='pt-2'>
                <FileExplorer onFolderSelect={handleFolderSelect} />
            </div>

            {/* Dialog popup to show generation progress and resource usage */}
            <Dialog header="Generation in Progress..." visible={isProgressDialogVisible} style={{ width: '50vw' }} modal onHide={() => setIsProgressDialogVisible(false)}>
                <div className="flex flex-column gap-3 pt-2">
                    <div>
                        <label>Generation Progress</label>
                        <ProgressBar mode="determinate" value={progress} />
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

export default Generator;