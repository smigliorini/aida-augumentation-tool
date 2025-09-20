// FileCard.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Panel } from 'primereact/panel';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { ScrollPanel } from 'primereact/scrollpanel';

// Component to display and manage files within a selected folder
function FileCard({ selectedFolderFromFolderCard, selectedParentDirFromFolderCard }) {
    // State to hold the list of files to display
    const [files, setFiles] = useState([]);
    const toast = useRef(null); // Ref for Toast component to show messages

    // Options for the file view dropdown
    const viewOptions = [
        { label: 'Input Dataset Files', value: 'input_ds' },
        { label: 'Input Range Query Files', value: 'rq_input'},
        { label: 'Selected Folder Content', value: 'selected_folder' }
    ];
    // State for the currently selected view option
    const [selectedViewOption, setSelectedViewOption] = useState(viewOptions[0].value);

    // States for the file preview dialog
    const [isPreviewDialogVisible, setIsPreviewDialogVisible] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [previewFileName, setPreviewFileName] = useState('');
    const [refreshKey, setRefreshKey] = useState(0); // State to trigger a manual refresh

    // Backend URL for file operations
    const backendUrl = 'http://localhost:5000/api/folders';

    // Memoized function to fetch files from the backend
    const fetchFiles = useCallback(async () => {
        setFiles([]); // Clear files before a new fetch to avoid stale data
        let url = '';

        if (selectedViewOption === 'input_ds') {
            url = `${backendUrl}?base_dir=parent_dir_input_ds`;
        } else if (selectedViewOption === 'selected_folder') {
            if (!selectedFolderFromFolderCard || !selectedParentDirFromFolderCard) {
                toast.current.show({ severity: 'info', summary: 'Info', detail: 'No folder selected in Folder Management or root directory unknown.', life: 3000 });
                return;
            }
            url = `${backendUrl}/${selectedFolderFromFolderCard}/content?base_dir=${selectedParentDirFromFolderCard}`;
        } else if (selectedViewOption === 'rq_input'){
            url = `${backendUrl}?base_dir=parent_dir_rq_input`;
        }

        if (url) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                const filesOnly = data.filter(item => item.type === 'file');
                setFiles(filesOnly);
            } catch (error) {
                console.error("Error fetching files:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to load the file: ${error.message}`, life: 3000 });
                setFiles([]); // Ensure files are cleared on error
            }
        }
    }, [selectedViewOption, selectedFolderFromFolderCard, selectedParentDirFromFolderCard, backendUrl]); // Dependencies for fetchFiles

    // useEffect hook to fetch files whenever the view option, selected folder, or refresh key changes
    useEffect(() => {
        fetchFiles();
    }, [fetchFiles, refreshKey]);

    // --- Action Handlers for files, memoized with useCallback ---

    // Function to handle file download
    const handleDownloadFile = useCallback(async (rowData) => {
        let currentBaseDir = '';
        if (selectedViewOption === 'input_ds') {
            currentBaseDir = 'parent_dir_input_ds';
        } else if (selectedViewOption === 'selected_folder') {
            currentBaseDir = selectedParentDirFromFolderCard;
        } else if (selectedViewOption === 'rq_input') {
            currentBaseDir = 'parent_dir_rq_input';
        }

        if (!currentBaseDir) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Unable to establish root directory for download.', life: 3000 });
            return;
        }

        let itemPathForDownload = rowData.name;
        if (selectedViewOption === 'selected_folder' && selectedFolderFromFolderCard) {
            itemPathForDownload = `${selectedFolderFromFolderCard}/${rowData.name}`;
        }

        try {
            window.location.href = `http://localhost:5000/download/${itemPathForDownload}?base_dir=${currentBaseDir}`;

            setTimeout(async () => {
                try {
                    const confirmResponse = await fetch(`http://localhost:5000/download/confirm/${rowData.name}?base_dir=${currentBaseDir}`, {
                        method: 'POST',
                    });
                    if (!confirmResponse.ok) {
                        const errorData = await confirmResponse.json();
                        console.error("Error confirming file download for deletion:", errorData.message || confirmResponse.status);
                    } else {
                        toast.current.show({ severity: 'success', summary: 'Success', detail: `Download of "${rowData.name}" completed.`, life: 3000 });
                    }
                } catch (error) {
                    console.error("Error sending confirm for file download:", error);
                    toast.current.show({ severity: 'error', summary: 'Error', detail: `Error confirming file download: ${error.message}`, life: 3000 });
                }
            }, 3000);
        } catch (error) {
            console.error("Error initiating file download:", error);
            toast.current.show({ severity: 'error', summary: 'Error', detail: `Error while downloading the file: ${error.message}`, life: 3000 });
        }
    }, [selectedViewOption, selectedFolderFromFolderCard, selectedParentDirFromFolderCard, toast]); // Dependencies for handleDownloadFile


    // Function to handle file deletion
    const handleDeleteFile = useCallback(async (rowData) => {
        if (window.confirm(`Are you sure to delete this file: "${rowData.name}"?`)) {
            let currentBaseDir = '';
            if (selectedViewOption === 'input_ds') {
                currentBaseDir = 'parent_dir_input_ds';
            } else if (selectedViewOption === 'selected_folder') {
                currentBaseDir = selectedParentDirFromFolderCard;
            } else if (selectedViewOption === 'rq_input') {
                currentBaseDir = 'parent_dir_rq_input';
            }

            if (!currentBaseDir) {
                toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Unable to establish root directory for deleting file.', life: 3000 });
                return;
            }

            let itemPathForDeletion = rowData.name;
            if (selectedViewOption === 'selected_folder' && selectedFolderFromFolderCard) {
                itemPathForDeletion = `${selectedFolderFromFolderCard}/${rowData.name}`;
            }

            try {
                const response = await fetch(`${backendUrl}/${itemPathForDeletion}?base_dir=${currentBaseDir}`, {
                    method: 'DELETE',
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error while deleting the file: ${errorData.message || response.status}`);
                }
                toast.current.show({ severity: 'success', summary: 'Success', detail: `File "${rowData.name}" deleted.`, life: 3000 });
                setRefreshKey(prev => prev + 1); // Trigger a re-fetch after deletion
            } catch (error) {
                console.error("Error deleting file:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to delete the file: ${error.message}`, life: 3000 });
            }
        }
    }, [selectedViewOption, selectedFolderFromFolderCard, selectedParentDirFromFolderCard, toast, backendUrl]); // Dependencies for handleDeleteFile

    // Function to handle file preview
    const handlePreviewFile = useCallback(async (rowData) => {
        let currentBaseDir = '';
        if (selectedViewOption === 'input_ds') {
            currentBaseDir = 'parent_dir_input_ds';
        } else if (selectedViewOption === 'selected_folder') {
            currentBaseDir = selectedParentDirFromFolderCard;
        } else if (selectedViewOption === 'rq_input') {
            currentBaseDir = 'parent_dir_rq_input';
        }

        if (!currentBaseDir) {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'Unable to establish root directory for file preview.', life: 3000 });
            return;
        }

        let itemPathForPreview = rowData.name;
        if (selectedViewOption === 'selected_folder' && selectedFolderFromFolderCard) {
            itemPathForPreview = `${selectedFolderFromFolderCard}/${rowData.name}`;
        }

        setPreviewFileName(rowData.name);
        setIsPreviewDialogVisible(true); // Open dialog immediately with loading state

        try {
            const response = await fetch(`http://localhost:5000/preview/file/${itemPathForPreview}?base_dir=${currentBaseDir}`);
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                } catch (jsonError) {
                    throw new Error(`HTTP error! status: ${response.status}. Response: ${errorText.substring(0, 200)}...`);
                }
            }
            const content = await response.text();
            setPreviewContent(content); // Set the file content for preview
        } catch (error) {
            console.error("Error fetching file for preview:", error);
            setPreviewContent(`Error while loading file preview of: ${error.message}`);
            toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to preview: ${error.message}`, life: 5000 });
        }
    }, [selectedViewOption, selectedFolderFromFolderCard, selectedParentDirFromFolderCard, toast]); // Dependencies for handlePreviewFile

    // Template for the file name column in DataTable
    const fileNameBodyTemplate = useCallback((rowData) => {
        return (
            <div className="flex align-items-center">
                <i className="pi pi-file mr-2"></i>
                <span>{rowData.name}</span>
            </div>
        );
    }, []); // No dependencies, as it only uses rowData.name which is stable

    // Template for the action buttons column in DataTable
    const actionBodyTemplate = useCallback((rowData) => {
        // Ensure actions are only for 'file' type items
        if (rowData.type === 'file') {
            return (
                <div className="flex gap-2">
                    <Button icon="pi pi-file-o" className="p-button-rounded p-button-info p-button-sm" onClick={() => handlePreviewFile(rowData)} tooltip="Preview File" />
                    <Button icon="pi pi-download" className="p-button-rounded p-button-success p-button-sm" onClick={() => handleDownloadFile(rowData)} tooltip="Download File" />
                    <Button icon="pi pi-trash" className="p-button-rounded p-button-danger p-button-sm" onClick={() => handleDeleteFile(rowData)} tooltip="Delete File" />
                </div>
            );
        }
        return null; // Don't render buttons for directories
    }, [handlePreviewFile, handleDownloadFile, handleDeleteFile]); // Dependencies are the memoized action handlers

    return (
        <Panel header='File Explorer' toggleable>
            <Toast ref={toast} />
            <div className="flex justify-content-start flex-wrap pb-2 align-items-center">
                <Dropdown
                    value={selectedViewOption}
                    options={viewOptions}
                    onChange={(e) => setSelectedViewOption(e.value)}
                    placeholder="Select the view"
                    className="mr-3"
                />
                <Button icon="pi pi-refresh" label="Refresh" onClick={() => setRefreshKey(prev => prev + 1)} />
            </div>

            {/* Info message for when no folder is selected */}
            {selectedViewOption === 'selected_folder' && !selectedFolderFromFolderCard && (
                <div className="p-message p-message-info mt-2">
                    <div className="p-message-wrapper">
                        <span className="p-message-icon pi pi-info-circle"></span>
                        <div className="p-message-text">Select a folder from "Folder Management" to preview the content here.</div>
                    </div>
                </div>
            )}

            {/* DataTable to display the files */}
            <DataTable value={files} emptyMessage="No file found.">
                <Column field="name" header="File Name" body={fileNameBodyTemplate} />
                <Column body={actionBodyTemplate} header="Actions" style={{ width: '180px' }} />
            </DataTable>

            {/* File Preview Dialog */}
            <Dialog header={`Preview: ${previewFileName}`} visible={isPreviewDialogVisible} style={{ width: '70vw' }} modal onHide={() => { setIsPreviewDialogVisible(false); setPreviewContent(''); setPreviewFileName(''); }}>
                <ScrollPanel style={{ width: '100%', height: '400px' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {previewContent || 'Loading...'}
                    </pre>
                </ScrollPanel>
            </Dialog>
        </Panel>
    );
}

export default FileCard;
