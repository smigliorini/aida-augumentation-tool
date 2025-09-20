import React from 'react';
import { Panel } from 'primereact/panel';

function DataDisp({ children }) {
    return (
        <>
            <Panel header="Generated data" toggleable collapsed>
                {children}
            </Panel>
        </>
    );
}

export default DataDisp;