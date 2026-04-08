import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import React, { useState, useEffect, useMemo } from "react";
import { 
    Zap, 
    MessageSquare, 
    ShieldAlert, 
    Plus, 
    Trash2, 
    RotateCcw, 
    X, 
    Info, 
    ArrowLeft,
    CheckCircle2,
    Settings2,
    Mail,
    Eye,
    ChevronRight,
    Search,
    Type,
    Image as ImageIcon,
    Square,
    Layout,
    Share2,
    ArrowUp,
    ArrowDown,
    Edit3
} from "lucide-react";
import { generateEmailHtml, type EmailBlock, type EmailBlockType } from "../utils/email-generator";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    const { id } = params;
    
    try {
        let currentAutomation = null;
        if (id && id !== 'new') {
            currentAutomation = await (prisma as any).automation.findUnique({
                where: id.includes('-') ? { id } : undefined,
            });
            
            if (!currentAutomation && !id.includes('-')) {
                currentAutomation = await (prisma as any).automation.findFirst({
                    where: { type: id }
                });
            }
        }

        if (!currentAutomation && !['welcome', 'limit_80', 'limit_100', 'manual'].includes(id || '')) {
            return redirect("/admin/emails/automations");
        }

        const templates = await (prisma as any).emailTemplate.findMany({
            where: { shop: 'GLOBAL' },
            select: { id: true, name: true, html: true, config: true, subject: true }
        });

        return json({ currentAutomation, requestedId: id, templates });
    } catch (error) {
        console.error("Prisma error in Automation Editor loader:", error);
        return redirect("/admin/emails/automations");
    }
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const formData = await request.formData();
    const action = formData.get("action");
    const id = formData.get("id") as string;
    const type = formData.get("type") as string;
    const shop = "GLOBAL";

    if (action === "save") {
        const name = formData.get("name") as string;
        const config = formData.get("config") as string;
        const isActive = formData.get("isActive") === "true";

        if (id && id !== 'new') {
            await (prisma as any).automation.update({
                where: { id },
                data: { name, config, isActive }
            });
        } else {
            await (prisma as any).automation.upsert({
                where: { shop_type: { shop, type } },
                update: { name, config, isActive },
                create: { shop, type, name, config, isActive }
            });
        }

        return json({ success: true });
    }

    if (action === "delete") {
        if (id) {
            await (prisma as any).automation.delete({
                where: { id }
            });
        }
        return redirect("/admin/emails/automations");
    }

    if (action === "toggle") {
        const isActive = formData.get("isActive") === "true";
        await (prisma as any).automation.update({
            where: { id },
            data: { isActive }
        });
        return json({ success: true });
    }

    return json({ error: "Invalid action" });
};

export default function AdminEmailAutomations() {
    const { currentAutomation, requestedId, templates } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    
    // Workflow State
    const [workflowName, setWorkflowName] = useState("");
    const [triggerType, setTriggerType] = useState<string>("");
    const [nodes, setNodes] = useState<any[]>([]);
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [editIsActive, setEditIsActive] = useState(true);
    const [isAddingStep, setIsAddingStep] = useState<{parentId: string, branch?: string} | null>(null);

    // Email Designer Modal State
    const [showDesigner, setShowDesigner] = useState<string | null>(null); // nodeId
    const [designBlocks, setDesignBlocks] = useState<EmailBlock[]>([]);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

    // Initialize from DB
    useEffect(() => {
        if (currentAutomation) {
            setWorkflowName(currentAutomation.name || "Untitled Automation");
            setTriggerType(currentAutomation.type);
            setEditIsActive(currentAutomation.isActive);
            try {
                const config = JSON.parse(currentAutomation.config);
                if (Array.isArray(config)) setNodes(config);
                else setNodes([{ id: '1', type: 'action', parentId: 'trigger', data: { label: 'Send Email', templateId: '' } }]);
            } catch (e) {
                setNodes([{ id: '1', type: 'action', parentId: 'trigger', data: { label: 'Send Email', templateId: '' } }]);
            }
        } else {
            setWorkflowName(requestedId === 'welcome' ? 'Welcome new subscribers' : 'Usage Warning Flow');
            setTriggerType(requestedId || 'welcome');
            setNodes([{ id: '1', type: 'action', parentId: 'trigger', data: { label: 'Send Email', templateId: '' } }]);
        }
    }, [currentAutomation, requestedId]);

    const addNode = (type: string, parentId: string, branch?: string) => {
        const newNode = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            parentId,
            branch,
            data: type === 'action' ? { label: 'Send Email', templateId: '' } : 
                  type === 'wait' ? { label: 'Wait Delay', duration: 1, unit: 'day' } :
                  { label: 'Check Condition', logic: 'is_opened' }
        };
        setNodes([...nodes, newNode]);
        setActiveNodeId(newNode.id);
        setIsAddingStep(null);
    };

    const removeNode = (id: string) => {
        const toDelete = [id];
        // Recursive find children
        const findChildren = (pid: string) => {
            nodes.filter(n => n.parentId === pid).forEach(child => {
                toDelete.push(child.id);
                findChildren(child.id);
            });
        };
        findChildren(id);
        setNodes(nodes.filter(n => !toDelete.includes(n.id)));
        if (activeNodeId === id) setActiveNodeId(null);
    };

    const updateNodeData = (id: string, newData: any) => {
        setNodes(nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...newData } } : n));
    };

    // Designer Helpers
    const openDesigner = (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if(!node) return;
        
        let initialBlocks = [];
        if(node.data.isCustom && node.data.customConfig) {
            initialBlocks = JSON.parse(node.data.customConfig);
        } else if(node.data.templateId) {
            const tmpl = templates.find((t: any) => t.id === node.data.templateId);
            if(tmpl?.config) initialBlocks = JSON.parse(tmpl.config);
        }
        
        setDesignBlocks(initialBlocks);
        setShowDesigner(nodeId);
    };

    const addDesignBlock = (type: EmailBlockType) => {
        const newBlock: EmailBlock = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            content: getDefaultContent(type),
            style: getDefaultStyle(type)
        };
        setDesignBlocks([...designBlocks, newBlock]);
    };

    const removeDesignBlock = (id: string) => {
        setDesignBlocks(designBlocks.filter(b => b.id !== id));
        if (selectedBlockId === id) setSelectedBlockId(null);
    };

    const moveDesignBlock = (index: number, direction: 'up' | 'down') => {
        const newBlocks = [...designBlocks];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < newBlocks.length) {
            [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
            setDesignBlocks(newBlocks);
        }
    };

    const updateDesignBlockContent = (id: string, newContent: any) => {
        setDesignBlocks(designBlocks.map(b => b.id === id ? { ...b, content: { ...b.content, ...newContent } } : b));
    };

    const updateDesignBlockStyle = (id: string, newStyle: any) => {
        setDesignBlocks(designBlocks.map(b => b.id === id ? { ...b, style: { ...b.style, ...newStyle } } : b));
    };

    const saveDesigner = () => {
        if(!showDesigner) return;
        const html = generateEmailHtml(designBlocks, "GLOBAL");
        updateNodeData(showDesigner, { 
            isCustom: true, 
            customConfig: JSON.stringify(designBlocks),
            customHtml: html
        });
        setShowDesigner(null);
    };

    const handleSave = () => {
        fetcher.submit({
            action: "save",
            id: currentAutomation?.id || "new",
            type: triggerType,
            name: workflowName,
            config: JSON.stringify(nodes),
            isActive: String(editIsActive)
        }, { method: "post" });
    };

    const handleDelete = () => {
        if(!currentAutomation?.id) return;
        if(confirm("Are you sure you want to delete this automation entirely?")) {
            fetcher.submit({ action: "delete", id: currentAutomation.id }, { method: "post" });
        }
    };

    // Recursive Node Renderer
    const renderWorkflow = (parentId: string, branch?: string) => {
        const children = nodes.filter(n => n.parentId === parentId && n.branch === branch);
        const isActiveBranch = isAddingStep?.parentId === parentId && isAddingStep?.branch === branch;
        
        return (
            <div className="branch-container">
                {children.map(node => (
                    <React.Fragment key={node.id}>
                        <div className="connector"></div>
                        <div className={`node-v3 ${node.type}-node ${activeNodeId === node.id ? 'active' : ''}`} onClick={() => setActiveNodeId(node.id)}>
                            <div className="node-header">
                                {node.type === 'action' && <><MessageSquare size={10} /> Action</>}
                                {node.type === 'wait' && <><RotateCcw size={10} /> Wait</>}
                                {node.type === 'condition' && <><ShieldAlert size={10} /> Condition</>}
                                <div style={{ flex: 1 }}></div>
                                <Settings2 size={10} />
                            </div>
                            <div className="node-body">
                                <div className="node-title">{node.data.label}</div>
                                <div className="node-desc">
                                    {node.type === 'action' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Mail size={10} /> 
                                            {node.data.isCustom ? "Custom Content" : (templates.find((t: any) => t.id === node.data.templateId)?.name || 'Needs Template')}
                                        </div>
                                    )}
                                    {node.type === 'wait' && `${node.data.duration} ${node.data.unit}(s)`}
                                    {node.type === 'condition' && (
                                        <div style={{ textTransform: 'capitalize' }}>{node.data.logic.replace('_', ' ')}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {node.type === 'condition' ? (
                            <div className="condition-split">
                                <div className="branch branch-yes">
                                    <div className="branch-label label-yes">YES</div>
                                    {renderWorkflow(node.id, 'yes')}
                                </div>
                                <div className="branch branch-no">
                                    <div className="branch-label label-no">NO</div>
                                    {renderWorkflow(node.id, 'no')}
                                </div>
                            </div>
                        ) : renderWorkflow(node.id)}
                    </React.Fragment>
                ))}
                
                {children.length === 0 && (
                    <div className="branch-end" style={{ position: 'relative' }}>
                        <div className="connector"></div>
                        <div className="add-btn-mini" onClick={() => setIsAddingStep(isActiveBranch ? null : { parentId, branch })}><Plus size={14} /></div>
                        
                        {isActiveBranch && (
                            <div style={{ position: 'absolute', top: '40px', left: '50%', transform: 'translateX(-50%)', background: 'white', border: '1px solid #e1e3e5', padding: '12px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', gap: '12px', zIndex: 100 }}>
                                <div style={{ textAlign: 'center', cursor: 'pointer', width: '50px' }} onClick={() => addNode('action', parentId, branch)}>
                                    <MessageSquare size={20} color="#7e22ce" />
                                    <div style={{ fontSize: '9px', fontWeight: 700 }}>Action</div>
                                </div>
                                <div style={{ textAlign: 'center', cursor: 'pointer', width: '50px' }} onClick={() => addNode('wait', parentId, branch)}>
                                    <RotateCcw size={20} color="#854d0e" />
                                    <div style={{ fontSize: '9px', fontWeight: 700 }}>Wait</div>
                                </div>
                                <div style={{ textAlign: 'center', cursor: 'pointer', width: '50px' }} onClick={() => addNode('condition', parentId, branch)}>
                                    <ShieldAlert size={20} color="#047857" />
                                    <div style={{ fontSize: '9px', fontWeight: 700 }}>Branch</div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flow-builder-v4">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
                
                .flow-builder-v4 { position: fixed; inset: 0; background: #f4f6f8; z-index: 9999; display: flex; flex-direction: column; font-family: 'Outfit', sans-serif; color: #1a1c1d; }

                /* Header */
                .flow-nav { height: 64px; background: white; border-bottom: 1px solid #e1e3e5; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
                .workflow-title-input { font-size: 16px; font-weight: 700; border: 1px solid transparent; padding: 4px 8px; border-radius: 6px; width: 300px; }
                .workflow-title-input:hover { background: #f1f2f3; }
                .workflow-title-input:focus { background: white; border-color: #008060; outline: none; }
                .btn-shopify-primary { background: #008060; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
                .btn-shopify-secondary { background: white; border: 1px solid #d2d5d8; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
                .btn-danger { background: #fdf2f2; border: 1px solid #fee2e2; color: #d72c0d; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
                .btn-danger:hover { background: #fee2e2; }

                /* Canvas */
                .canvas-area { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 80px 200px; background-image: radial-gradient(#d2d5d8 1px, transparent 1px); background-size: 20px 20px; }
                .branch-container { display: flex; flex-direction: column; align-items: center; }
                
                .node-v3 { width: 300px; background: white; border-radius: 12px; border: 1px solid #e1e3e5; box-shadow: 0 4px 12px rgba(0,0,0,0.05); cursor: pointer; overflow: hidden; transition: all 0.2s; position: relative; z-index: 5; }
                .node-v3:hover { transform: translateY(-2px); border-color: #008060; }
                .node-v3.active { border-color: #008060; box-shadow: 0 0 0 2px rgba(0,128,96,0.2); }

                .node-header { padding: 6px 12px; display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; background: #f6f6f7; color: #6d7175; }
                .trigger-node .node-header { background: #e0f2fe; color: #0369a1; }
                .action-node .node-header { background: #f3e8ff; color: #7e22ce; }
                .wait-node .node-header { background: #fef9c3; color: #854d0e; }
                .condition-node .node-header { background: #ecfdf5; color: #047857; }

                .node-body { padding: 12px 16px; }
                .node-title { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
                .node-desc { font-size: 12px; color: #6d7175; }

                /* Connectors */
                .connector { width: 2px; height: 32px; background: #d2d5d8; position: relative; }
                .connector::after { content: ''; position: absolute; bottom: -4px; left: -3px; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid #d2d5d8; }

                /* Branching UI */
                .condition-split { display: flex; gap: 60px; position: relative; padding-top: 32px; }
                .condition-split::before { content: ''; position: absolute; top: 0; left: 50%; width: 2px; height: 32px; background: #d2d5d8; transform: translateX(-50%); }
                .condition-split::after { content: ''; position: absolute; top: 32px; left: calc(50% - 130px); width: 260px; height: 2px; background: #d2d5d8; }
                
                .branch { display: flex; flex-direction: column; align-items: center; min-width: 300px; position: relative; }
                .branch::before { content: ''; position: absolute; top: 0; left: 50%; width: 2px; height: 32px; background: #d2d5d8; transform: translateX(-50%); }
                
                .branch-label { position: absolute; top: 6px; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 900; background: white; border: 1px solid #d2d5d8; z-index: 10; }
                .label-yes { color: #008060; left: calc(50% - 35px); }
                .label-no { color: #d72c0d; left: calc(50% + 15px); }

                /* Plus Buttons */
                .add-btn-mini { width: 24px; height: 24px; background: white; border: 1px solid #d2d5d8; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .add-btn-mini:hover { background: #008060; color: white; border-color: #008060; transform: scale(1.1); }

                /* Side Panel */
                .prop-panel { width: 380px; background: white; border-left: 1px solid #e1e3e5; display: flex; flex-direction: column; box-shadow: -4px 0 12px rgba(0,0,0,0.02); }
                .panel-header { padding: 20px; border-bottom: 1px solid #e1e3e5; display: flex; align-items: center; justify-content: space-between; }
                .panel-body { padding: 24px; flex: 1; overflow-y: auto; }
                .form-label { font-size: 13px; font-weight: 600; margin-bottom: 8px; display: block; }
                .form-input { width: 100%; padding: 10px; border: 1px solid #d2d5d8; border-radius: 8px; margin-bottom: 20px; font-size: 14px; }
                
                .template-preview-card { border: 1px solid #e1e3e5; border-radius: 12px; overflow: hidden; margin-top: 12px; }
                .preview-header { padding: 10px; background: #f6f6f7; border-bottom: 1px solid #e1e3e5; font-size: 11px; font-weight: 800; display: flex; justify-content: space-between; }
                .preview-body { height: 180px; background: white; overflow: hidden; position: relative; }
                .preview-body iframe { width: 100%; height: 100%; border: none; transform: scale(0.4); transform-origin: top left; width: 250%; height: 250%; }

                /* Designer Modal */
                .designer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
                .designer-modal { width: 95vw; height: 90vh; background: #f4f6f8; border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .designer-main { flex: 1; display: grid; grid-template-columns: 240px 1fr 340px; overflow: hidden; }
                .canvas-inner { width: 600px; min-height: 800px; background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin: 40px auto; border-radius: 8px; overflow: hidden; }
                .designer-block { position: relative; border: 2px solid transparent; cursor: pointer; }
                .designer-block:hover { border-color: #008060; }
                .designer-block.selected { border-color: #008060; background: rgba(0,128,96,0.02); }
                .block-tools { position: absolute; right: -40px; top: 0; display: flex; flex-direction: column; gap: 4px; }
                .tool-btn { width: 32px; height: 32px; background: white; border: 1px solid #d2d5d8; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; }

                .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
                .status-active { background: #e6f4ea; color: #008060; }
                .status-inactive { background: #f1f2f3; color: #6d7175; }

                .logic-card { padding: 12px; border: 1px solid #d2d5d8; border-radius: 10px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }
                .logic-card:hover { border-color: #008060; background: #f6fbf9; }
                .logic-card.selected { border-color: #008060; background: #f6fbf9; box-shadow: 0 0 0 1px #008060; }
            `}</style>

            <div className="flow-nav">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="btn-shopify-secondary" style={{ padding: '8px' }} onClick={() => window.location.href="/admin/emails/automations"}>
                        <ArrowLeft size={16} />
                    </button>
                    <input className="workflow-title-input" value={workflowName} onChange={e => setWorkflowName(e.target.value)} />
                    <span className={`status-badge ${editIsActive ? 'status-active' : 'status-inactive'}`}>
                        {editIsActive ? 'Active' : 'Disabled'}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-danger" onClick={handleDelete}>Delete Workflow</button>
                    <button className="btn-shopify-primary" onClick={handleSave}>
                        {fetcher.state === 'submitting' ? 'Saving...' : 'Save Workflow'}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div className="canvas-area">
                    <div className="branch-container">
                        {/* Trigger Node */}
                        <div className={`node-v3 trigger-node ${activeNodeId === 'trigger' ? 'active' : ''}`} onClick={() => setActiveNodeId('trigger')}>
                            <div className="node-header"><Zap size={10} /> Trigger</div>
                            <div className="node-body">
                                <div className="node-title">
                                    {triggerType === 'welcome' && "App Installation"}
                                    {triggerType === 'limit_80' && "80% Usage reached"}
                                    {triggerType === 'limit_100' && "100% Limit reached"}
                                    {triggerType === 'manual' && "API Trigger"}
                                </div>
                                <div className="node-desc">Starts when event occurs</div>
                            </div>
                        </div>

                        {/* Rendering Tree */}
                        {renderWorkflow('trigger')}
                    </div>
                </div>

                <div className="prop-panel">
                    <div className="panel-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings2 size={16} />
                            <div style={{ fontWeight: 800, fontSize: '13px', textTransform: 'uppercase' }}>Configure Step</div>
                        </div>
                        <CheckCircle2 size={18} color="#008060" />
                    </div>
                    <div className="panel-body">
                        {!activeNodeId ? (
                            <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '100px' }}>
                                <Info size={40} style={{ margin: '0 auto 16px' }} />
                                <p>Select a node to edit properties</p>
                            </div>
                        ) : activeNodeId === 'trigger' ? (
                            <>
                                <label className="form-label">Workflow Name</label>
                                <input className="form-input" value={workflowName} onChange={e => setWorkflowName(e.target.value)} />

                                <label className="form-label">Workflow Status</label>
                                <select className="form-input" value={editIsActive ? 'on' : 'off'} onChange={e => setEditIsActive(e.target.value === 'on')}>
                                    <option value="on">Active (Running)</option>
                                    <option value="off">Disabled (Stopped)</option>
                                </select>

                                <label className="form-label">Trigger Event</label>
                                <select className="form-input" value={triggerType} onChange={e => setTriggerType(e.target.value)}>
                                    <option value="welcome">New App Install</option>
                                    <option value="limit_80">Usage reach 80%</option>
                                    <option value="limit_100">Usage reach 100%</option>
                                    <option value="manual">Manual API Call</option>
                                </select>
                            </>
                        ) : (
                            (() => {
                                const node = nodes.find(n => n.id === activeNodeId);
                                if (!node) return null;
                                return (
                                    <>
                                        <label className="form-label">Step Label</label>
                                        <input className="form-input" value={node.data.label} onChange={e => updateNodeData(node.id, { label: e.target.value })} />

                                        {node.type === 'action' && (
                                            <>
                                                <label className="form-label">Select Base Template</label>
                                                <select className="form-input" value={node.data.templateId || ''} onChange={e => updateNodeData(node.id, { templateId: e.target.value, isCustom: false })}>
                                                    <option value="">-- Choose Template --</option>
                                                    {templates.map((t: any) => (
                                                        <option key={t.id} value={t.id}>{t.name}</option>
                                                    ))}
                                                </select>

                                                {node.data.templateId && (
                                                    <div className="template-preview-card">
                                                        <div className="preview-header">
                                                            <span>PREVIEW</span>
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <Eye size={12} />
                                                                <span onClick={() => openDesigner(node.id)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>EDIT CONTENT</span>
                                                            </div>
                                                        </div>
                                                        <div className="preview-body">
                                                            <iframe title="preview" srcDoc={node.data.isCustom ? node.data.customHtml : templates.find((t: any) => t.id === node.data.templateId)?.html} />
                                                        </div>
                                                        <div style={{ padding: '12px', background: '#f6f6f7', fontSize: '11px', lineHeight: '1.4' }}>
                                                            {node.data.isCustom ? (
                                                                <span style={{ color: '#008060', fontStyle: 'italic' }}><CheckCircle2 size={10} style={{ display: 'inline', marginRight: '4px' }} /> This node uses customized content.</span>
                                                            ) : "Using global template content. Click edit to customize for this step."}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {node.type === 'wait' && (
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label className="form-label">Duration</label>
                                                    <input type="number" className="form-input" value={node.data.duration} onChange={e => updateNodeData(node.id, { duration: e.target.value })} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <label className="form-label">Unit</label>
                                                    <select className="form-input" value={node.data.unit} onChange={e => updateNodeData(node.id, { unit: e.target.value })}>
                                                        <option value="minute">Minute(s)</option>
                                                        <option value="hour">Hour(s)</option>
                                                        <option value="day">Day(s)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        {node.type === 'condition' && (
                                            <>
                                                <label className="form-label">Check Condition</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {[
                                                        { id: 'is_opened', label: 'Email was opened', desc: 'Checks if previous email was opened' },
                                                        { id: 'is_clicked', label: 'Link was clicked', desc: 'Checks if any link was clicked' },
                                                        { id: 'usage_high', label: 'Usage > 90%', desc: 'Checks if account usage exceeds 90%' }
                                                    ].map(opt => (
                                                        <div key={opt.id} className={`logic-card ${node.data.logic === opt.id ? 'selected' : ''}`} onClick={() => updateNodeData(node.id, { logic: opt.id })}>
                                                            <div style={{ fontWeight: 800, fontSize: '13px' }}>{opt.label}</div>
                                                            <div style={{ fontSize: '11px', color: '#6d7175' }}>{opt.desc}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}

                                        <button className="btn-shopify-secondary" style={{ width: '100%', marginTop: '40px', color: '#d72c0d', borderColor: '#d72c0d', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => removeNode(node.id)}>
                                            <Trash2 size={14} /> Remove Step & Children
                                        </button>
                                    </>
                                );
                            })()
                        )}
                    </div>
                </div>
            </div>

            {/* Email Designer Modal (Absolute Synchronization with Template Editor) */}
            {showDesigner && (
                <div className="designer-overlay">
                    <style>{`
                        .modal-designer-root { 
                            width: 100vw; height: 100vh; background: #f1f5f9; display: flex; flex-direction: column; font-family: 'Outfit', sans-serif; 
                        }
                        .modal-header {
                            height: 72px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 24px; justify-content: space-between;
                        }
                        .modal-editor-main { flex: 1; display: grid; grid-template-columns: 280px 1fr 340px; overflow: hidden; }
                        .modal-sidebar-left { background: white; border-right: 1px solid #e2e8f0; padding: 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
                        .modal-canvas-area { overflow-y: auto; padding: 40px; display: flex; justify-content: center; background: #f1f5f9; }
                        .modal-canvas-inner { width: 600px; min-height: 800px; background: white; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden; }
                        .modal-sidebar-right { background: white; border-left: 1px solid #e2e8f0; padding: 24px; overflow-y: auto; }
                        
                        .block-button-v3 { width: 100%; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; color: #475569; }
                        .block-button-v3:hover { background: #f0f7ff; border-color: #6366f1; color: #6366f1; transform: translateY(-2px); }
                        .block-button-v3 strong { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800; }
                        
                        .canvas-block-v3 { position: relative; border: 2px solid transparent; cursor: pointer; transition: all 0.2s; }
                        .canvas-block-v3:hover { border-color: #e2e8f0; }
                        .canvas-block-v3.selected { border-color: #6366f1; background: rgba(99, 102, 241, 0.02); }
                        
                        .modal-block-tools { position: absolute; left: 100%; top: 0; margin-left: 10px; display: none; flex-direction: column; gap: 4px; z-index: 10; }
                        .canvas-block-v3.selected .modal-block-tools { display: flex; }
                        
                        .btn-save-indigo { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 10px 24px; border-radius: 12px; border: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s; }
                        .btn-save-indigo:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
                    `}</style>
                    <div className="modal-designer-root">
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{ background: '#f0f7ff', padding: '10px', borderRadius: '12px' }}>
                                    <Mail size={24} color="#6366f1" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '18px' }}>Customizing Automation Email</div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Syncing changes with flow...</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn-shopify-secondary" onClick={() => setShowDesigner(null)}>Discard</button>
                                <button className="btn-save-indigo" onClick={saveDesigner}><CheckCircle2 size={18} /> Apply Changes</button>
                            </div>
                        </div>

                        <div className="modal-editor-main">
                            {/* Left: Elements */}
                            <div className="modal-sidebar-left">
                                <div style={{ fontWeight: 800, fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Elements</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    {[
                                        { type: 'header', icon: <Layout size={20} />, label: 'Header' },
                                        { type: 'heading', icon: <Type size={20} />, label: 'Heading' },
                                        { type: 'text', icon: <Edit3 size={20} />, label: 'Text' },
                                        { type: 'button', icon: <Square size={20} />, label: 'Button' },
                                        { type: 'hero', icon: <ImageIcon size={20} />, label: 'Banner' },
                                        { type: 'divider', icon: <div style={{ height: '2px', width: '20px', background: '#94a3b8' }}></div>, label: 'Divider' },
                                        { type: 'footer', icon: <Share2 size={20} />, label: 'Footer' },
                                        { type: 'coupon', icon: <Zap size={20} />, label: 'Coupon' }
                                    ].map(item => (
                                        <button key={item.type} className="block-button-v3" onClick={() => addDesignBlock(item.type as any)}>
                                            {item.icon}
                                            <strong>{item.label}</strong>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Center: Canvas */}
                            <div className="modal-canvas-area" onClick={() => setSelectedBlockId(null)}>
                                <div className="modal-canvas-inner">
                                    {designBlocks.map((block, idx) => (
                                        <div 
                                            key={block.id} 
                                            className={`canvas-block-v3 ${selectedBlockId === block.id ? 'selected' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); setSelectedBlockId(block.id); }}
                                        >
                                            <div dangerouslySetInnerHTML={{ __html: renderBlockPreview(block) }} />
                                            <div className="modal-block-tools">
                                                <button className="tool-btn" onClick={(e) => { e.stopPropagation(); moveDesignBlock(idx, 'up'); }} disabled={idx === 0}><ArrowUp size={14} /></button>
                                                <button className="tool-btn" onClick={(e) => { e.stopPropagation(); moveDesignBlock(idx, 'down'); }} disabled={idx === designBlocks.length - 1}><ArrowDown size={14} /></button>
                                                <button className="tool-btn delete" onClick={(e) => { e.stopPropagation(); removeDesignBlock(block.id); }}><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                    {designBlocks.length === 0 && (
                                        <div style={{ padding: '80px 40px', textAlign: 'center' }}>
                                            <Mail size={48} style={{ margin: '0 auto 20px', color: '#cbd5e1' }} />
                                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#94a3b8' }}>Empty Canvas</div>
                                            <p style={{ color: '#cbd5e1', fontSize: '14px' }}>Add elements to build your email.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: Properties */}
                            <div className="modal-sidebar-right">
                                <div style={{ fontWeight: 800, fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>Settings</div>
                                {selectedBlockId ? (
                                    (() => {
                                        const block = designBlocks.find(b => b.id === selectedBlockId);
                                        if(!block) return null;
                                        return (
                                            <div>
                                                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', marginBottom: '24px' }}>
                                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>OBJECT TYPE</div>
                                                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', textTransform: 'capitalize' }}>{block.type} Element</div>
                                                </div>

                                                {(block.type === 'heading' || block.type === 'text') && (
                                                    <>
                                                        <span className="prop-label">Text Content</span>
                                                        <textarea className="prop-input" rows={6} value={(block.content as any).text} onChange={e => updateDesignBlockContent(block.id, { text: e.target.value })} />
                                                    </>
                                                )}

                                                {block.type === 'button' && (
                                                    <>
                                                        <span className="prop-label">Label</span>
                                                        <input className="prop-input" value={(block.content as any).label} onChange={e => updateDesignBlockContent(block.id, { label: e.target.value })} />
                                                        <span className="prop-label">Link URL</span>
                                                        <input className="prop-input" value={(block.content as any).url} onChange={e => updateDesignBlockContent(block.id, { url: e.target.value })} />
                                                    </>
                                                )}

                                                {block.type === 'coupon' && (
                                                    <>
                                                        <span className="prop-label">Coupon Code</span>
                                                        <input className="prop-input" value={(block.content as any).code} onChange={e => updateDesignBlockContent(block.id, { code: e.target.value })} />
                                                    </>
                                                )}

                                                {block.type === 'header' && (
                                                    <>
                                                        <span className="prop-label">Logo Text</span>
                                                        <input className="prop-input" value={(block.content as any).logoText} onChange={e => updateDesignBlockContent(block.id, { logoText: e.target.value })} />
                                                    </>
                                                )}

                                                {block.type === 'footer' && (
                                                    <>
                                                        <span className="prop-label">Footer Text</span>
                                                        <textarea className="prop-input" rows={4} value={(block.content as any).text} onChange={e => updateDesignBlockContent(block.id, { text: e.target.value })} />
                                                    </>
                                                )}

                                                <span className="prop-label">Alignment</span>
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                                                    {['left', 'center', 'right'].map(align => (
                                                        <button 
                                                            key={align} 
                                                            className="tool-btn" 
                                                            style={{ flex: 1, borderColor: block.style?.textAlign === align ? '#6366f1' : '#e2e8f0', background: block.style?.textAlign === align ? '#f0f7ff' : 'white' }}
                                                            onClick={() => updateDesignBlockStyle(block.id, { textAlign: align })}
                                                        >
                                                            {align[0].toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>

                                                <button className="btn-save-indigo" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSelectedBlockId(null)}>
                                                    Done Editing
                                                </button>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '40px' }}>
                                        <p style={{ fontSize: '13px' }}>Select an element on the canvas to edit its properties.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(fetcher.data as any)?.success && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#008060', color: 'white', padding: '12px 24px', borderRadius: '30px', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 20000 }}>
                    <CheckCircle2 size={16} /> Saved!
                </div>
            )}
        </div>
    );
}

// Helpers
function getDefaultContent(type: EmailBlockType) {
    switch(type) {
        case 'header': return { logoText: 'My Brand' };
        case 'heading': return { text: 'New Campaign' };
        case 'text': return { text: 'Write your email content here...' };
        case 'button': return { label: 'Click Here', url: '#' };
        case 'coupon': return { code: 'WELCOME20' };
        case 'footer': return { text: '&copy; 2026 My Store. All rights reserved.' };
        default: return {};
    }
}

function getDefaultStyle(type: EmailBlockType) {
    if (type === 'button') return { buttonColor: '#6366f1', textAlign: 'center' };
    if (type === 'heading') return { fontSize: '24px', textAlign: 'left', color: '#1e293b' };
    return { textAlign: 'left' };
}

function renderBlockPreview(block: EmailBlock): string {
    const { type, content } = block;
    const style = block.style || {};
    switch(type) {
        case 'header': 
            return `<div style="padding: 24px; text-align: center; border-bottom: 2px solid #6366f1; color: #6366f1; font-weight: 900; font-size: 20px;">${(content as any).logoText || 'LOGO'}</div>`;
        case 'heading':
            return `<div style="padding: 24px 40px; font-size: 24px; font-weight: 800; text-align: ${style.textAlign || 'left'}; color: #1e293b;">${(content as any).text}</div>`;
        case 'text':
            return `<div style="padding: 10px 40px 24px; font-size: 15px; line-height: 1.6; color: #475569; text-align: ${style.textAlign || 'left'};">${(content as any).text.replace(/\n/g, '<br>')}</div>`;
        case 'button':
            return `<div style="padding: 24px; text-align: ${style.textAlign || 'center'}"><div style="background: ${style.buttonColor || '#6366f1'}; color: white; padding: 12px 32px; border-radius: 8px; font-weight: 700; display: inline-block;">${(content as any).label}</div></div>`;
        case 'divider':
            return `<div style="padding: 20px 40px;"><hr style="border: 0; border-top: 1px solid #f1f5f9;"></div>`;
        case 'coupon':
            return `<div style="padding: 24px 40px;"><div style="background: #fdfdfd; border: 2px dashed #6366f1; padding: 24px; text-align: center; font-size: 24px; font-weight: 900; color: #6366f1; letter-spacing: 2px;">${(content as any).code}</div></div>`;
        case 'footer':
            return `<div style="padding: 40px; background: #f8fafc; text-align: center; color: #94a3b8; font-size: 11px;">${(content as any).text}</div>`;
        default: return "";
    }
}
