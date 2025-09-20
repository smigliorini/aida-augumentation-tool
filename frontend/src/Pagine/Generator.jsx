import React, { useEffect, useRef, useState } from 'react';
import { Panel } from 'primereact/panel';
import { Dropdown } from 'primereact/dropdown';
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
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column';
// Import for the progress popup
import { Dialog } from 'primereact/dialog';
import FileExplorer from '../Components/FileExplorer';


// Main component for the data generation UI.
function Generator() {
    // --- STATE MANAGEMENT ---

    // State for generator input parameters.
    const [distribution, setDistribution] = useState(null);
    const [geometry, setGeometry] = useState(null);
    const [cardinality, setCardinality] = useState(null);
    // Dimensions are hardcoded to 2.
    const [dimensions] = useState(2);
    const [format, setFormat] = useState(null);
    const [boxMaxSizeX, setBoxMaxSizeX] = useState(null);
    const [boxMaxSizeY, setBoxMaxSizeY] = useState(null);
    const [diagPercentage, setDiagPercentage] = useState(null);
    const [diagBuffer, setDiagBuffer] = useState(null);
    const [parcSrange, setParcSrange] = useState(null);
    const [parcDither, setParcDither] = useState(null);
    const [affineMatrix, setAffineMatrix] = useState('');
    const [compress, setCompress] = useState(false);
    const [bitPropability, setBitProbability] = useState(null);
    const [bitDigits, setBitDigits] = useState(null);
    const [pointPolySize, setPointPolySize] = useState(null);
    const [pointMaxSeg, setPointMaxSeg] = useState(null);
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
    const [socket, setSocket] = useState(null);
    const [progress, setProgress] = useState(0);
    const toast = useRef(null);
    const [canDownload, setCanDownload] = useState(false);
    const [fileName, setFilename] = useState(null);
    const [inputCsvFileName, setInputCsvFileName] = useState(null);
    
    // State for CSV upload functionality.
    const [csvFile, setCsvFile] = useState(null);
    const [useCsvUpload, setUseCsvUpload] = useState(false);

    // State for file explorer and output directory.
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [selectedFolderParentDir, setSelectedFolderParentDir] = useState(null);

    // State for system resource monitoring.
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);

    // State to control the visibility of the progress popup.
    const [isProgressDialogVisible, setIsProgressDialogVisible] = useState(false);

    // --- COMPONENT CONFIGURATION ---

    // Defines the columns for the datasets table.
    const columns = [
        { field: 'distribution', header: 'Distribution' }, { field: 'x1', header: 'X1' },
        { field: 'y1', header: 'Y1' }, { field: 'x2', header: 'X2' }, { field: 'y2', header: 'Y2' },
        { field: 'cardinality', header: 'Cardinality' }, { field: 'dimensions', header: 'Dimensions' },
        { field: 'geometry', header: 'Geometry' }, { field: 'format', header: 'Format' },
        { field: 'maxsize', header: 'Maxsize' }, { field: 'percentage', header: 'Percentage' },
        { field: 'buffer', header: 'Buffer' }, { field: 'srange', header: 'Srange' },
        { field: 'dither', header: 'Dither' }, { field: 'probability', header: 'BitProbability' },
        { field: 'digits', header: 'Digits' },
        {
            header: 'Actions',
            body: (rowData) => (<Button icon="pi pi-trash" className="p-button-danger" onClick={() => handleDelete(rowData)} />)
        }
    ];

    // Maps distribution-geometry combinations to their specific input fields.
    // This is used to conditionally render the correct UI inputs.
    const dependentFieldsMap = {
        'Uniform-Point': [], 'Uniform-Box': ['boxMaxSize'], 'Uniform-Polygon': ['pointPolySize', 'pointMaxSeg'],
        'Diagonal-Point': ['diagPercentage', 'diagBuffer'], 'Diagonal-Box': ['diagPercentage', 'diagBuffer', 'boxMaxSize'], 'Diagonal-Polygon': ['diagPercentage', 'diagBuffer', 'pointPolySize', 'pointMaxSeg'],
        'Gaussian-Point': [], 'Gaussian-Box': ['boxMaxSize'], 'Gaussian-Polygon': ['pointPolySize', 'pointMaxSeg'],
        'Parcel-Box': ['parcSrange', 'parcDither'], 'Parcel-Polygon': ['parcSrange', 'parcDither'],
        'Bit-Point': ['bitPropability', 'bitDigits'], 'Bit-Box': ['bitPropability', 'bitDigits', 'boxMaxSize'], 'Bit-Polygon': ['bitPropability', 'bitDigits', 'pointPolySize', 'pointMaxSeg'],
        'Sierpinski-Point': [], 'Sierpinski-Box': ['boxMaxSize'], 'Sierpinski-Polygon': ['pointPolySize', 'pointMaxSeg'],
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
        setBitProbability(null); setBitDigits(null); setBoxMaxSizeX(null); setBoxMaxSizeY(null);
        setPointPolySize(null); setPointMaxSeg(null);
    };

    // Resets fields and sets the default format when the geometry type changes.
    const onGeometryChange = (e) => {
        const selectedGeometry = e.value;
        setGeometry(selectedGeometry);
        // Clear geometry-specific fields.
        setBoxMaxSizeX(null); setBoxMaxSizeY(null); setPointPolySize(null); setPointMaxSeg(null);
        
        // Automatically set the format based on the selected geometry.
        if (selectedGeometry && selectedGeometry.name === 'Polygon') {
            setFormat({ name: 'wkt' });
        } else if (selectedGeometry && (selectedGeometry.name === 'Point' || selectedGeometry.name === 'Box')) {
            setFormat({ name: 'csv' });
        } else {
            setFormat(null);
        }
    };
    
    // Handlers for box max size inputs.
    const handleBoxMaxSizeXChange = (e) => setBoxMaxSizeX(e.value !== null ? parseFloat(e.value) : null);
    const handleBoxMaxSizeYChange = (e) => setBoxMaxSizeY(e.value !== null ? parseFloat(e.value) : null);

    // Effect hook to manage the WebSocket connection.
    useEffect(() => {
        // Establishes a connection to the backend server.
        const newSocket = io('http://127.0.0.1:5000');
        setSocket(newSocket);

        // Listens for progress updates from the server.
        newSocket.on('progress', (data) => setProgress(data.progress));
        
        // Listens for resource usage updates.
        newSocket.on('resource_usage', (data) => {
            setCpuUsage(data.cpu);
            setRamUsage(data.ram);
        });

        // Handles generation errors from the server.
        newSocket.on('generate_data_error', (data) => {
            setError(data.error); setLoading(false); setProgress(0); setCpuUsage(0); setRamUsage(0);
            setIsProgressDialogVisible(false); // Hide dialog on error.
            if (toast.current) toast.current.show({ severity: 'error', summary: 'Error', detail: data.error, life: 5000 });
        });

        // Handles the completion of the generation process.
        newSocket.on('generate_data_complete', (data) => {
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
        return () => { newSocket.disconnect(); };
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

        const currentComboKey = `${distribution.name}-${geometry.name}`;
        const newId = idCounter;

        // Build the dataset object with all common parameters.
        const dataToSend = {
            id: newId,
            distribution: distribution ? distribution.name.toLowerCase() : '',
            cardinality: cardinality !== null ? parseInt(cardinality, 10) : 0,
            dimensions: dimensions !== null ? parseInt(dimensions, 10) : 0,
            geometry: geometry ? geometry.name.toLowerCase() : '',
            format: format ? format.name.toLowerCase() : '',
            x1: x1, y1: y1, x2: x2, y2: y2,
        };

        // Add optional parameters based on the current selection.
        if (dependentFieldsMap[currentComboKey]?.includes('boxMaxSize')) dataToSend.maxsize = `${boxMaxSizeX.toFixed(1)},${boxMaxSizeY.toFixed(1)}`;
        if (dependentFieldsMap[currentComboKey]?.includes('diagPercentage') && diagPercentage !== null) dataToSend.percentage = diagPercentage;
        if (dependentFieldsMap[currentComboKey]?.includes('diagBuffer') && diagBuffer !== null) dataToSend.buffer = diagBuffer;
        if (dependentFieldsMap[currentComboKey]?.includes('parcSrange') && parcSrange !== null) dataToSend.srange = parcSrange;
        if (dependentFieldsMap[currentComboKey]?.includes('parcDither') && parcDither !== null) dataToSend.dither = parcDither;
        if (dependentFieldsMap[currentComboKey]?.includes('bitPropability') && bitPropability !== null) dataToSend.probability = bitPropability;
        if (dependentFieldsMap[currentComboKey]?.includes('bitDigits') && bitDigits !== null) dataToSend.digits = bitDigits;
        if (dependentFieldsMap[currentComboKey]?.includes('pointPolySize') && pointPolySize !== null) dataToSend.polysize = pointPolySize;
        if (dependentFieldsMap[currentComboKey]?.includes('pointMaxSeg') && pointMaxSeg !== null) dataToSend.maxseg = pointMaxSeg;
        if (affineMatrix) dataToSend.affinematrix = affineMatrix;
        if (compress) dataToSend.compress = compress;
        if (seed) dataToSend.seed = seed;

        // Add the new dataset to the list and increment the ID counter.
        setDatasets([...datasets, dataToSend]);
        setIdCounter(prevId => prevId + 1);

        // Reset all input fields for the next entry.
        setDistribution(null); setGeometry(null); setCardinality(null);
        setFormat(null); setBoxMaxSizeX(null); setBoxMaxSizeY(null); setDiagPercentage(null);
        setDiagBuffer(null); setParcSrange(null); setParcDither(null); setAffineMatrix('');
        setCompress(false); setBitProbability(null); setBitDigits(null); setPointPolySize(null);
        setPointMaxSeg(null); setSeed(null); setX1(null); setY1(null); setX2(null); setY2(null);
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
        if (!socket) return;
        if (datasets.length === 0) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Add at least one dataset to the table.', life: 5000 });
            return;
        }
        startGeneration();
        // Remove the temporary 'id' field before sending to the server.
        const dataToSendToServer = datasets.map(({ id, ...rest }) => rest);
        socket.emit('generate_data', { datasets: dataToSendToServer, folder: selectedFolder });
    };

    // Sends the uploaded CSV file to the server for generation.
    const generateDataCsv = () => {
        if (!socket || !csvFile) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Please upload a CSV file.', life: 3000 });
            return;
        }
        startGeneration();
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
                    <div className="flex align-items-center">
                        <InputSwitch checked={useCsvUpload} onChange={e => setUseCsvUpload(e.value)} />
                        <label htmlFor="csvSwitch" className="ml-2">Upload CSV File</label>
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
                                
                                {/* Conditionally rendered fields based on distribution and geometry */}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('boxMaxSize') && (<>
                                    <FloatLabel><InputNumber inputId="boxMaxSizeX" value={boxMaxSizeX} onChange={handleBoxMaxSizeXChange} variant="filled" /><label htmlFor="boxMaxSizeX">Max Size X</label></FloatLabel>
                                    <FloatLabel><InputNumber inputId="boxMaxSizeY" value={boxMaxSizeY} onChange={handleBoxMaxSizeYChange} variant="filled" /><label htmlFor="boxMaxSizeY">Max Size Y</label></FloatLabel>
                                </>)}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('pointPolySize') && <FloatLabel><InputNumber inputId="pointPolySize" value={pointPolySize} onChange={(e) => setPointPolySize(e.value)} variant="filled" /><label htmlFor="pointPolySize">Poly Size</label></FloatLabel>}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('pointMaxSeg') && <FloatLabel><InputNumber inputId="pointMaxSeg" value={pointMaxSeg} onChange={(e) => setPointMaxSeg(e.value)} variant="filled" /><label htmlFor="pointMaxSeg">Max Segments</label></FloatLabel>}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('diagPercentage') && <FloatLabel><InputNumber inputId="diagPercentage" value={diagPercentage} onChange={(e) => setDiagPercentage(e.value)} variant="filled" /><label htmlFor="diagPercentage">Percentage</label></FloatLabel>}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('diagBuffer') && <FloatLabel><InputNumber inputId="diagBuffer" value={diagBuffer} onChange={(e) => setDiagBuffer(e.value)} variant="filled" /><label htmlFor="diagBuffer">Buffer</label></FloatLabel>}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('parcSrange') && <FloatLabel><InputNumber inputId="parcSrange" value={parcSrange} onChange={(e) => setParcSrange(e.value)} variant="filled" /><label htmlFor="parcSrange">Split Range</label></FloatLabel>}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('parcDither') && <FloatLabel><InputNumber inputId="parcDither" value={parcDither} onChange={(e) => setParcDither(e.value)} variant="filled" /><label htmlFor="parcDither">Dither</label></FloatLabel>}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('bitPropability') && <FloatLabel><InputNumber inputId="bitPropability" value={bitPropability} onChange={(e) => setBitProbability(e.value)} variant="filled" /><label htmlFor="bitPropability">Probability</label></FloatLabel>}
                                {dependentFieldsMap[`${distribution?.name}-${geometry?.name}`]?.includes('bitDigits') && <FloatLabel><InputNumber inputId="bitDigits" value={bitDigits} onChange={(e) => setBitDigits(e.value)} variant="filled" /><label htmlFor="bitDigits">Digits</label></FloatLabel>}
                                
                                {/* Action buttons */}
                                <div className='flex justify-content-end flex-wrap'><Button onClick={insertDataset}>Insert Dataset</Button></div>
                                <div className="flex justify-content-end flex-wrap"><Button onClick={generateData}>Submit</Button></div>
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