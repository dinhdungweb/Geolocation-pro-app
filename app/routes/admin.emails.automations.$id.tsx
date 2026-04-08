import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import React, { useState, useEffect } from "react";
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
    CheckCircle2
} from "lucide-react";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    const { id } = params;
    
    try {
        let currentAutomation = null;
        if (id && id !== 'new') {
            currentAutomation = await (prisma as any).automation.findUnique({
                where: { id }
            });
        }

        if (!currentAutomation && !['welcome', 'limit_80', 'limit_100'].includes(id || '')) {
            return redirect("/admin/emails/automations");
        }

        const templates = await (prisma as any).emailTemplate.findMany({
            where: { shop: 'GLOBAL' },
            select: { id: true, name: true }
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
    const type = formData.get("type") as string;
    const shop = "GLOBAL";

    if (action === "save") {
        const name = formData.get("name") as string;
        const config = formData.get("config") as string;
        const isActive = formData.get("isActive") === "true";

        await (prisma as any).automation.upsert({
            where: { shop_type: { shop, type } },
            update: { name, config, isActive },
            create: { shop, type, name, config, isActive }
        });

        return json({ success: true });
    }

    if (action === "toggle") {
        const isActive = formData.get("isActive") === "true";
        const id = formData.get("id") as string;
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
    
    const [workflowName, setWorkflowName] = useState("");
    const [triggerType, setTriggerType] = useState<string>("");
    const [nodes, setNodes] = useState<any[]>([]);
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [editIsActive, setEditIsActive] = useState(true);
    const [isAddingStep, setIsAddingStep] = useState(false);

    useEffect(() => {
        if (currentAutomation) {
            setWorkflowName(currentAutomation.name || "Untitled Automation");
            setTriggerType(currentAutomation.type);
            setEditIsActive(currentAutomation.isActive);
            try {
                const config = JSON.parse(currentAutomation.config);
                if (Array.isArray(config)) setNodes(config);
                else setNodes([{ id: '1', type: 'action', data: { label: 'Send Email', templateId: '' } }]);
            } catch (e) {
                setNodes([{ id: '1', type: 'action', data: { label: 'Send Email', templateId: '' } }]);
            }
        } else {
            setWorkflowName(requestedId === 'welcome' ? 'Welcome new subscribers' : 'Usage Warning Flow');
            setTriggerType(requestedId || 'welcome');
            setNodes([{ id: '1', type: 'action', data: { label: 'Send Email', templateId: '' } }]);
        }
    }, [currentAutomation, requestedId]);

    const addNode = (type: string) => {
        const newNode = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            data: type === 'action' ? { label: 'Send Email', templateId: '' } : 
                  type === 'wait' ? { label: 'Wait Delay', duration: 1, unit: 'day' } :
                  { label: 'Condition', logic: 'is_opened' }
        };
        setNodes([...nodes, newNode]);
        setActiveNodeId(newNode.id);
        setIsAddingStep(false);
    };

    const removeNode = (id: string) => {
        setNodes(nodes.filter(n => n.id !== id));
        if (activeNodeId === id) setActiveNodeId(null);
    };

    const updateNodeData = (id: string, newData: any) => {
        setNodes(nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...newData } } : n));
    };

    const handleSave = () => {
        fetcher.submit({
            action: "save",
            type: triggerType,
            name: workflowName,
            config: JSON.stringify(nodes),
            isActive: String(editIsActive)
        }, { method: "post" });
    };

    return (
        <div className="flow-builder-v3">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
                .flow-builder-v3 { position: fixed; inset: 0; background: #f4f6f8; z-index: 9999; display: flex; flex-direction: column; font-family: 'Outfit', sans-serif; color: #1a1c1d; }
                .flow-nav { height: 64px; background: white; border-bottom: 1px solid #e1e3e5; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
                .workflow-title-input { font-size: 16px; font-weight: 700; border: 1px solid transparent; padding: 4px 8px; border-radius: 6px; background: transparent; }
                .workflow-title-input:hover { background: #f1f2f3; }
                .workflow-title-input:focus { background: white; border-color: #008060; outline: none; }
                .btn-shopify-primary { background: #008060; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
                .btn-shopify-secondary { background: white; border: 1px solid #d2d5d8; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
                .canvas-area { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 80px 0; background-image: radial-gradient(#d2d5d8 1px, transparent 1px); background-size: 20px 20px; }
                .nodes-stack { display: flex; flex-direction: column; align-items: center; width: 400px; }
                .node-v3 { width: 320px; background: white; border-radius: 12px; border: 1px solid #e1e3e5; box-shadow: 0 4px 12px rgba(0,0,0,0.05); cursor: pointer; overflow: hidden; transition: transform 0.2s; }
                .node-v3:hover { transform: translateY(-2px); border-color: #008060; }
                .node-v3.active { border-color: #008060; box-shadow: 0 0 0 2px rgba(0,128,96,0.2); }
                .node-header { padding: 8px 12px; display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
                .trigger-node .node-header { background: #e0f2fe; color: #0369a1; }
                .action-node .node-header { background: #f3e8ff; color: #7e22ce; }
                .wait-node .node-header { background: #fef9c3; color: #854d0e; }
                .condition-node .node-header { background: #ecfdf5; color: #047857; }
                .node-body { padding: 16px; }
                .node-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
                .node-desc { font-size: 13px; color: #6d7175; }
                .connector { width: 2px; height: 40px; background: #d2d5d8; position: relative; }
                .connector::after { content: ''; position: absolute; bottom: -6px; left: -4px; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid #d2d5d8; }
                .add-btn { width: 32px; height: 32px; background: white; border: 1px solid #d2d5d8; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; }
                .add-btn:hover { background: #008060; color: white; border-color: #008060; }
                .add-menu { position: absolute; background: white; border: 1px solid #e1e3e5; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); padding: 8px; display: flex; gap: 8px; margin-top: 40px; }
                .menu-item { padding: 12px; border-radius: 8px; cursor: pointer; text-align: center; width: 70px; }
                .menu-item:hover { background: #f4f6f8; }
                .menu-item span { font-size: 10px; font-weight: 700; display: block; margin-top: 4px; }
                .prop-panel { width: 360px; background: white; border-left: 1px solid #e1e3e5; display: flex; flex-direction: column; }
                .panel-header { padding: 20px; border-bottom: 1px solid #e1e3e5; font-weight: 800; text-transform: uppercase; font-size: 13px; }
                .panel-body { padding: 24px; flex: 1; overflow-y: auto; }
                .form-label { font-size: 13px; font-weight: 600; margin-bottom: 8px; display: block; }
                .form-input { width: 100%; padding: 10px; border: 1px solid #d2d5d8; border-radius: 8px; margin-bottom: 20px; }
                .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
                .status-active { background: #e6f4ea; color: #1e8e3e; }
                .status-inactive { background: #f1f3f4; color: #5f6368; }
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
                    <button className="btn-shopify-primary" onClick={handleSave}>
                        {fetcher.state === 'submitting' ? 'Saving...' : 'Save Workflow'}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div className="canvas-area">
                    <div className="nodes-stack">
                        <div className={`node-v3 trigger-node ${activeNodeId === 'trigger' ? 'active' : ''}`} onClick={() => setActiveNodeId('trigger')}>
                            <div className="node-header"><Zap size={10} /> Trigger</div>
                            <div className="node-body">
                                <div className="node-title">
                                    {triggerType === 'welcome' && "App Installation"}
                                    {triggerType === 'limit_80' && "80% Usage"}
                                    {triggerType === 'limit_100' && "100% Limit"}
                                    {triggerType === 'manual' && "Manual API"}
                                </div>
                                <div className="node-desc">Start when event occurs</div>
                            </div>
                        </div>

                        {nodes.map(node => (
                            <React.Fragment key={node.id}>
                                <div className="connector"></div>
                                <div className={`node-v3 ${node.type}-node ${activeNodeId === node.id ? 'active' : ''}`} onClick={() => setActiveNodeId(node.id)}>
                                    <div className="node-header">
                                        {node.type === 'action' && <><MessageSquare size={10} /> Action</>}
                                        {node.type === 'wait' && <><RotateCcw size={10} /> Wait</>}
                                        {node.type === 'condition' && <><ShieldAlert size={10} /> Condition</>}
                                    </div>
                                    <div className="node-body">
                                        <div className="node-title">{node.data.label}</div>
                                        <div className="node-desc">
                                            {node.type === 'action' && (templates.find((t: any) => t.id === node.data.templateId)?.name || 'Choose a template')}
                                            {node.type === 'wait' && `${node.data.duration} ${node.data.unit}(s)`}
                                            {node.type === 'condition' && `Logic: ${node.data.logic}`}
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        ))}

                        <div className="connector"></div>
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                            <div className="add-btn" onClick={() => setIsAddingStep(!isAddingStep)}>
                                <Plus size={16} />
                            </div>
                            {isAddingStep && (
                                <div className="add-menu">
                                    <div className="menu-item" onClick={() => addNode('action')}>
                                        <MessageSquare size={20} color="#7e22ce" />
                                        <span>Action</span>
                                    </div>
                                    <div className="menu-item" onClick={() => addNode('wait')}>
                                        <RotateCcw size={20} color="#854d0e" />
                                        <span>Wait</span>
                                    </div>
                                    <div className="menu-item" onClick={() => addNode('condition')}>
                                        <ShieldAlert size={20} color="#047857" />
                                        <span>Condition</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="prop-panel">
                    <div className="panel-header">Configure Step</div>
                    <div className="panel-body">
                        {!activeNodeId ? (
                            <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '40px' }}>
                                <Info size={32} style={{ margin: '0 auto 12px' }} />
                                <p>Select a node to edit</p>
                            </div>
                        ) : activeNodeId === 'trigger' ? (
                            <>
                                <label className="form-label">Workflow Status</label>
                                <select className="form-input" value={editIsActive ? 'on' : 'off'} onChange={e => setEditIsActive(e.target.value === 'on')}>
                                    <option value="on">Enable Workflow</option>
                                    <option value="off">Disable Workflow</option>
                                </select>

                                <label className="form-label">Trigger Event</label>
                                <select className="form-input" value={triggerType} onChange={e => setTriggerType(e.target.value)}>
                                    <option value="welcome">App Installation</option>
                                    <option value="limit_80">80% Monthly Usage</option>
                                    <option value="limit_100">100% Monthly Usage</option>
                                    <option value="manual">Manual Trigger (API)</option>
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
                                                <label className="form-label">Email Template</label>
                                                <select className="form-input" value={node.data.templateId || ''} onChange={e => updateNodeData(node.id, { templateId: e.target.value })}>
                                                    <option value="">-- Select Template --</option>
                                                    {templates.map((t: any) => (
                                                        <option key={t.id} value={t.id}>{t.name}</option>
                                                    ))}
                                                </select>
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

                                        <button className="btn-shopify-secondary" style={{ width: '100%', marginTop: '20px', color: '#d72c0d', borderColor: '#d72c0d' }} onClick={() => removeNode(node.id)}>
                                            <Trash2 size={14} /> Delete Step
                                        </button>
                                    </>
                                );
                            })()
                        )}
                    </div>
                </div>
            </div>

            {fetcher.data?.success && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#008060', color: 'white', padding: '12px 24px', borderRadius: '30px', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 10000 }}>
                    <CheckCircle2 size={16} /> Saved!
                </div>
            )}
        </div>
    );
}
