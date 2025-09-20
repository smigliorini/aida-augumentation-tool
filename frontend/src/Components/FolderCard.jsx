import React, { useState, useEffect, useRef } from 'react';
import { TreeTable } from 'primereact/treetable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { Checkbox } from 'primereact/checkbox';
import { Panel } from 'primereact/panel';
import { Dropdown } from 'primereact/dropdown';

/**
 * FolderCard Component
 * Manages folder display, selection, creation, deletion, renaming, and downloading.
 * It interacts with a backend API for file system operations.
 *
 * @param {object} props - Component props.
 * @param {function} props.onFolderSelect - Callback function to notify parent component of folder selection/deselection.
 * @param {string} props.selectedFolder - The currently selected folder name (passed from parent).
 * @param {string} props.selectedParentDir - The parent directory of the currently selected folder (passed from parent).
 */
function FolderCard({ onFolderSelect, selectedFolder: propSelectedFolder, selectedParentDir: propSelectedParentDir }) {
    // State to store the list of folders fetched from the backend
    const [folders, setFolders] = useState([]);
    // Internal state to manage the selected folder within FolderCard.
    // It's initialized from props for consistent behavior with the parent.
    const [selectedFolder, setSelectedFolder] = useState(propSelectedFolder);
    // State to store the content (files/subfolders) of the currently selected folder
    const [folderContent, setFolderContent] = useState([]);
    // State for the new folder name input in the add folder dialog
    const [newFolderName, setNewFolderName] = useState('');
    // State to control the visibility of the add folder dialog
    const [isAddFolderDialogVisible, setIsAddFolderDialogVisible] = useState(false);
    // State to control the visibility of the rename folder dialog
    const [isRenameFolderDialogVisible, setIsRenameFolderDialogVisible] = useState(false);
    // State to store the folder object to be renamed
    const [folderToRename, setFolderToRename] = useState(null);
    // State for the new name input in the rename folder dialog
    const [renameFolderName, setRenameFolderName] = useState('');

    // Define the available parent directories that can be managed
    const parentDirOptions = [
        { label: '1.Dataset Folders', value: 'parent_dir_dataset' },
        { label: '2.Index Folders', value: 'index_folders' },
        { label: "3.Range Query Folder", value: "range_query_results"},
        { label: "4.Balancing Analysis Folders ", value: "training_sets"},
        { label: '6.Histogram Folders', value: 'parent_dir_histogram' },
    ];
    // State to hold the currently selected parent directory from the dropdown.
    // Defaults to 'parent_dir_dataset'.
    const [selectedParentDir, setSelectedParentDir] = useState(parentDirOptions[0].value);

    // Backend API URL for folder operations
    const backendUrl = 'http://localhost:5000/api/folders';
    // Ref for PrimeReact Toast component to display notifications
    const toast = useRef(null);

    // Effect hook to synchronize internal selectedFolder state with the prop from parent.
    // This ensures that if the parent clears the selection, FolderCard also reflects it.
    useEffect(() => {
        setSelectedFolder(propSelectedFolder);
    }, [propSelectedFolder]);

    // Effect hook to fetch folders whenever the selectedParentDir changes.
    // This reloads the folder list when the user switches between main directories.
    useEffect(() => {
        fetchFolders();
    }, [selectedParentDir]);

    /**
     * Fetches the list of folders from the backend based on the selected parent directory.
     * Transforms the data for TreeTable display.
     */
    const fetchFolders = async () => {
        try {
            // Include selectedParentDir as a query parameter for the backend API call
            const response = await fetch(`${backendUrl}?base_dir=${selectedParentDir}`);
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            const data = await response.json();
            // Transform the flat list of folders into a TreeTable compatible format
            const treeData = data.map(item => ({
                key: item.name, // Unique key for TreeTable node
                data: item, // Original item data
                icon: 'pi pi-folder', // PrimeIcons folder icon
                children: [] // Initialize children array (can be populated for nested structures)
            }));
            setFolders(treeData);
            // Clear folder content display when a new parent directory is selected
            setFolderContent([]);
        } catch (error) {
            console.error("Error while retrieving folders:", error);
            toast.current.show({ severity: 'error', summary: 'Error', detail: 'Unable to load folders.', life: 3000 });
        }
    };

    /**
     * Opens the dialog for adding a new folder.
     */
    const handleAddFolder = () => {
        setIsAddFolderDialogVisible(true);
    };

    /**
     * Sends a request to the backend to create a new folder.
     */
    const createNewFolder = async () => {
        if (newFolderName) {
            try {
                const response = await fetch(backendUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newFolderName, baseDir: selectedParentDir }), // Pass new folder name and selected parent directory
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error while creating the folder: ${errorData.message || response.status}`);
                }
                toast.current.show({ severity: 'success', summary: 'Success', detail: `Folder "${newFolderName}" created.`, life: 3000 });
                fetchFolders(); // Refresh the folder list
                setIsAddFolderDialogVisible(false); // Close the dialog
                setNewFolderName(''); // Clear the input field
            } catch (error) {
                console.error("Error while creating the folder:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to create the folder: ${error.message}`, life: 3000 });
            }
        }
    };

    /**
     * Sends a request to the backend to delete a specified folder.
     * Includes a confirmation prompt for the user.
     * @param {string} folderName - The name of the folder to delete.
     */
    const handleDeleteFolder = async (folderName) => {
        // Using window.confirm for simplicity, consider a custom modal for better UX.
        if (window.confirm(`Are you sure you want to delete the folder "${folderName}" in the directory "${selectedParentDir}"?`)) {
            try {
                // Pass selectedParentDir as a query parameter for deletion
                const response = await fetch(`${backendUrl}/${folderName}?base_dir=${selectedParentDir}`, {
                    method: 'DELETE',
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error while deleting the folder: ${errorData.message || response.status}`);
                }
                toast.current.show({ severity: 'success', summary: 'Success', detail: `Folder "${folderName}" deleted.`, life: 3000 });
                fetchFolders(); // Refresh the folder list
            } catch (error) {
                console.error("Error while deleting the folder:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to delete the folder: ${error.message}`, life: 3000 });
            }
        }
    };

    /**
     * Opens the dialog for renaming a folder and pre-fills the current name.
     * @param {object} folder - The folder object to be renamed.
     */
    const handleRenameFolder = (folder) => {
        setFolderToRename(folder);
        setRenameFolderName(folder.data.name);
        setIsRenameFolderDialogVisible(true);
    };

    /**
     * Sends a request to the backend to rename a folder.
     */
    const confirmRenameFolder = async () => {
        // Ensure a folder is selected for renaming and a new name is provided, and it's different from the old name.
        if (folderToRename && renameFolderName && renameFolderName !== folderToRename.data.name) {
            try {
                // Pass the old folder name and the new name, along with the base directory
                const response = await fetch(`${backendUrl}/${folderToRename.data.name}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newName: renameFolderName, baseDir: selectedParentDir }),
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error while renaming the folder: ${errorData.message || response.status}`);
                }
                toast.current.show({ severity: 'success', summary: 'Success', detail: `Folder renamed to "${renameFolderName}".`, life: 3000 });
                fetchFolders(); // Refresh the folder list
                setIsRenameFolderDialogVisible(false); // Close the dialog
                setFolderToRename(null); // Clear the folder to rename state
                setRenameFolderName(''); // Clear the input field
            } catch (error) {
                console.error("Error while renaming the folder:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to rename the folder: ${error.message}`, life: 3000 });
            }
        }
    };

    /**
     * Handles the selection and deselection of a folder within the TreeTable.
     * This function is called when a folder row is clicked.
     * @param {object} rowData - The data of the clicked row (folder).
     */
    const handleFolderSelectInternal = async (rowData) => {
        const folderName = rowData.data.name;

        if (selectedFolder === folderName) {
            // If the clicked folder is already selected, deselect it.
            setSelectedFolder(null); // Clear internal selected folder state
            setFolderContent([]); // Clear displayed folder content
            if (onFolderSelect) {
                onFolderSelect(null, null); // Notify parent component of deselection
            }
            toast.current.show({ severity: 'info', summary: 'Info', detail: 'Folder selection cleared. Datasets will be created in the root.', life: 3000 });
        } else {
            // Otherwise, select the new folder.
            setSelectedFolder(folderName); // Set internal selected folder state
            if (onFolderSelect) {
                onFolderSelect(folderName, selectedParentDir); // Notify parent component of new selection
            }

            try {
                // Fetch the content of the newly selected folder from the backend.
                const response = await fetch(`${backendUrl}/${folderName}/content?base_dir=${selectedParentDir}`);
                if (!response.ok) {
                    throw new Error(`Error while retrieving the folder content: ${response.status}`);
                }
                const data = await response.json();
                setFolderContent(data); // Set the content for display
            } catch (error) {
                console.error("Error while fetching folder content:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to load folder content: ${error.message}`, life: 3000 });
            }
        }
    };

    /**
     * Template for rendering the folder name column in the TreeTable.
     * Makes the entire folder name area clickable for selection/deselection.
     * @param {object} rowData - The data for the current row.
     * @returns {JSX.Element} - Rendered JSX for the folder name column.
     */
    const folderNameBodyTemplate = (rowData) => {
        return (
            <div className="flex flex-column align-items-start">
                <div
                    style={{ fontWeight: 'bold', cursor: 'pointer' }} // Add cursor pointer for better UX
                    onClick={() => handleFolderSelectInternal(rowData)} // Handles click for selection/deselection
                >
                    <Checkbox
                        inputId={`folder-${rowData.data.name}`}
                        checked={selectedFolder === rowData.data.name}
                        readOnly // Make checkbox read-only as its state is controlled by the div click
                    />
                    <label htmlFor={`folder-${rowData.data.name}`} className="ml-2">{rowData.data.name.split('\\').slice(-1)[0]}</label>
                </div>
                <small className="ml-4" style={{ color: 'grey' }}>
                    {rowData.data.name}
                </small>
            </div>
        );
    };

    /**
     * Initiates the download process for the currently selected folder.
     * It first requests the backend to zip the folder, then triggers the download,
     * and finally sends a confirmation to delete the zip file from the server.
     */
    const downloadFolder = async () => {
        if (selectedFolder) {
            try {
                // Request the backend to create a ZIP file of the selected folder
                const response = await fetch(`http://localhost:5000/zip/folder/${selectedFolder}?base_dir=${selectedParentDir}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error in the creation of the ZIP file: ${errorData.message || response.status}`);
                }
                const data = await response.json();
                const zipFileName = data.zip_filename;

                // Trigger the file download in the browser
                window.location.href = `http://localhost:5000/download/${zipFileName}?base_dir=${selectedParentDir}`;

                // Send confirmation to the backend after a delay (to allow download to start)
                setTimeout(async () => {
                    try {
                        const confirmResponse = await fetch(`http://localhost:5000/download/confirm/${zipFileName}?base_dir=${selectedParentDir}`, {
                            method: 'POST',
                        });
                        if (!confirmResponse.ok) {
                            const errorData = await confirmResponse.json();
                            console.error("Error confirming download:", errorData.message || confirmResponse.status);
                            toast.current.show({ severity: 'error', summary: 'Error', detail: `Error confirming download: ${errorData.message}`, life: 3000 });
                        } else {
                            toast.current.show({ severity: 'success', summary: 'Success', detail: `Download completed, zip file deleted from server side.`, life: 3000 });
                        }
                    } catch (error) {
                        console.error("Error while sending the confirm for the download:", error);
                        toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to confirm download: ${error.message}`, life: 3000 });
                    }
                }, 5000); // 5-second delay (adjust as needed)

            } catch (error) {
                console.error("Error while downloading the folder:", error);
                toast.current.show({ severity: 'error', summary: 'Error', detail: `Unable to download the folder: ${error.message}`, life: 3000 });
            }
        } else {
            toast.current.show({ severity: 'warn', summary: 'Warning', detail: 'No folder selected to download.', life: 3000 });
        }
    };

    /**
     * Template for rendering action buttons (Rename, Delete, Download) in the TreeTable.
     * @param {object} rowData - The data for the current row.
     * @returns {JSX.Element} - Rendered JSX for the action buttons.
     */
    const actionBodyTemplate = (rowData) => {
        return (
            <div className="flex gap-2">
                <Button icon="pi pi-pencil" className="p-button-rounded p-button-sm" onClick={() => handleRenameFolder(rowData)} tooltip="Rename" />
                <Button icon="pi pi-trash" className="p-button-rounded p-button-danger p-button-sm" onClick={() => handleDeleteFolder(rowData.data.name)} tooltip="Delete" />
                {/* Download button is now generic and will trigger for selected folder */}
                <Button icon="pi pi-download" className="p-button-rounded p-button-success p-button-sm" onClick={downloadFolder} tooltip="Download" />
            </div>
        );
    };

    /**
     * Footer content for the "New folder" dialog.
     */
    const addFolderDialogFooter = (
        <div>
            <Button label="Exit" icon="pi pi-times" onClick={() => setIsAddFolderDialogVisible(false)} className="p-button-text" />
            <Button label="Create" icon="pi pi-check" onClick={createNewFolder} disabled={selectedParentDir !== 'parent_dir_dataset'} /> {/* Disable if not dataset folder */}
        </div>
    );

    /**
     * Footer content for the "Rename folder" dialog.
     */
    const renameFolderDialogFooter = (
        <div>
            <Button label="Exit" icon="pi pi-times" onClick={() => setIsRenameFolderDialogVisible(false)} className="p-button-text" />
            <Button label="Rename" icon="pi pi-check" onClick={confirmRenameFolder} />
        </div>
    );

    return (
        <Panel header='Folder Management' toggleable>
            <Toast ref={toast} />
            <div className="flex justify-content flex-wrap pb-2 align-items-center">
                <Dropdown
                    value={selectedParentDir}
                    options={parentDirOptions}
                    onChange={(e) => setSelectedParentDir(e.value)}
                    placeholder="Select Main Folder"
                    className="mr-3"
                />
                <Button
                    label="New Folder"
                    icon="pi pi-folder-plus"
                    onClick={handleAddFolder}
                    disabled={selectedParentDir !== 'parent_dir_dataset'} // Only enable for dataset folder
                />
                <Button label='Update' className="ml-2" icon="pi pi-replay" onClick={fetchFolders}/>
            </div>
            <TreeTable value={folders}>
                <Column field="name" className='flex-1' header="Folder Name" body={folderNameBodyTemplate} />
                <Column field="file_count" header="File Count" />
                <Column header="Actions" body={actionBodyTemplate} />
            </TreeTable>


            <Dialog header="New folder" visible={isAddFolderDialogVisible} style={{ width: '50vw' }} modal footer={addFolderDialogFooter} onHide={() => setIsAddFolderDialogVisible(false)}>
                <div className="field">
                    <label htmlFor="newFolderName" className="font-bold">Name</label>
                    <InputText id="newFolderName" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                </div>
            </Dialog>

            <Dialog header="Rename folder" visible={isRenameFolderDialogVisible} style={{ width: '50vw' }} modal footer={renameFolderDialogFooter} onHide={() => setIsRenameFolderDialogVisible(false)}>
                {folderToRename && (
                    <div className="field">
                        <label htmlFor="renameFolderName" className="font-bold">New Name</label>
                        <InputText id="renameFolderName" value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} />
                    </div>
                )}
            </Dialog>
        </Panel>
    );
}

export default FolderCard;
