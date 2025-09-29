import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Tree } from 'primereact/tree';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
/**
 * AdHoc components for handling Fractal Dimension types of executions
 * This components only purpose is to select and pass to the server a file or a folder based on the selected type of analysis
 * also makes more clear to the user what to do
 */
function FractalDimSelector({ rootKey, selectedKey, onSelect, expandedKeys, onExpansionChange }) {
    const [nodes, setNodes] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!rootKey) {
            setNodes([]);
            return;
        }

        setLoading(true);
        axios.get('http://localhost:5000/api/explorer/roots')
            .then(response => {
                const rootNodes = response.data;
                const filteredNodes = rootNodes.filter(node => node.key === rootKey);
                setNodes(filteredNodes);
            })
            .catch(error => console.error("Error fetching root directories:", error))
            .finally(() => setLoading(false));
    }, [rootKey]);

    const onExpand = (event) => {
        const node = event.node;
        
        // Inform the parent component to update the expanded keys
        onExpansionChange(prevKeys => ({ ...prevKeys, [node.key]: true }));

        // Lazy load children if they haven't been loaded yet
        if (!node.children || node.children.length === 0) {
            setLoading(true);
            axios.get(`http://localhost:5000/api/explorer/content?path=${node.data.path}`)
                .then(res => {
                    const children = res.data;
                    let newNodes = JSON.parse(JSON.stringify(nodes));
                    const targetNode = findNodeByKey(newNodes, node.key);
                    
                    if (targetNode) {
                        targetNode.children = children;
                        setNodes(newNodes);
                    }
                })
                .catch(error => console.error("Error fetching folder content:", error))
                .finally(() => setLoading(false));
        }
    };
    
    const onCollapse = (event) => {
        const node = event.node;
        // Inform the parent component to update the expanded keys
        onExpansionChange(prevKeys => {
            const newKeys = { ...prevKeys };
            delete newKeys[node.key];
            return newKeys;
        });
    };
    
    const findNodeByKey = (nodes, key) => {
        for (const node of nodes) {
            if (node.key === key) return node;
            if (node.children) {
                const found = findNodeByKey(node.children, key);
                if (found) return found;
            }
        }
        return null;
    };
    
    if (!rootKey) {
        return <Message severity="info" text="Please select an Analysis Type above to browse files." />;
    }
    
    if (loading && nodes.length === 0) {
        return <ProgressSpinner style={{ width: '50px', height: '50px' }} strokeWidth="8" />;
    }

    return (
        <Tree 
            value={nodes} 
            lazy
            expandedKeys={expandedKeys}
            onExpand={onExpand}
            onCollapse={onCollapse}
            selectionMode="single"
            selectionKeys={selectedKey}
            onSelect={onSelect}
            loading={loading}
            className="w-full"
        />
    );
}

export default FractalDimSelector;