import React, { lazy } from "react";
import {Menubar} from 'primereact/menubar';
import { Link, useNavigate } from "react-router-dom";
import {Avatar} from 'primereact/avatar';
import { InputText } from "primereact/inputtext";

function MyMenu(){
    const navigate = useNavigate();

    const items = [
        {label: "Home", icon: 'pi pi-home', command: () => navigate('/')},
        {label: "1.Generator", icon: 'pi pi-file-o', command: () => navigate('/generator')},
        {label: "2.Index", icon: "pi pi-folder-open", command: () => navigate('/index')},
        {label: "3.Range Query", icon: 'pi pi-search', command: () => navigate('/range')},
        {label: "4.Balancing Analysis", icon: 'pi pi-wrench', command: () => navigate('/rank')},
        {label: "5.Spatial Augmentation", icon: 'pi pi-arrow-circle-up', command: () => navigate('/augmentation')},
        {label: "6.Histogram", icon: 'pi pi-chart-bar', command: () => navigate('/histogram')},
        {label: "Fractal Dimension", icon: 'pi pi-cloud', command: () => navigate('/fractal')}

    ];

    const end = (
        <div className="flex align-items-center gap-2">
            <InputText placeholder="Search" type="text" className="w-8rem sm:w-auto" />
            <Avatar shape='circle' icon="pi pi-user"/>
        </div>
    );

    return (
        <div className="manuBar">
            <Menubar model={items} end={end}/>
        </div>
    );
}

export default MyMenu;