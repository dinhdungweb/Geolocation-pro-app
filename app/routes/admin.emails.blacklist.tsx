import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import { 
    ShieldAlert, 
    Plus, 
    Trash2, 
    Search, 
    Info,
    CheckCircle,
    XCircle,
    Store
} from "lucide-react";
import { useState, useMemo } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    // Fetch all blacklisted shops
    const blacklist = await prisma.emailBlacklist.findMany({
        orderBy: { createdAt: 'desc' }
    });

    // Fetch all known shops from Settings to populate the selector
    // Excluding 'GLOBAL' record
    const knownShops = await prisma.settings.findMany({
        where: {
            NOT: { shop: 'GLOBAL' }
        },
        select: { shop: true }
    });

    return json({ blacklist, knownShops });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const formData = await request.formData();
    const action = formData.get("_action");

    if (action === "add") {
        const shop = formData.get("shop") as string;
        if (!shop) return json({ error: "Shop domain is required" }, { status: 400 });
        
        try {
            await prisma.emailBlacklist.create({
                data: { shop: shop.trim() }
            });
            return json({ success: true, message: "Shop added to blacklist" });
        } catch (e) {
            return json({ error: "Shop is already in the blacklist or an error occurred" }, { status: 400 });
        }
    }

    if (action === "delete") {
        const id = formData.get("id") as string;
        await prisma.emailBlacklist.delete({
            where: { id }
        });
        return json({ success: true, message: "Shop removed from blacklist" });
    }

    return json({});
};

export default function EmailBlacklist() {
    const { blacklist, knownShops } = useLoaderData<typeof loader>();
    const actionData = useActionData<{ success?: boolean; error?: string; message?: string }>();
    const navigation = useNavigation();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedShop, setSelectedShop] = useState("");
    const [manualShop, setManualShop] = useState("");

    const isSubmitting = navigation.state === "submitting";

    // Filter known shops that are not already in the blacklist
    const availableShops = useMemo(() => {
        const blacklistedDomains = new Set(blacklist.map((b: any) => b.shop));
        return knownShops
            .filter((s: any) => !blacklistedDomains.has(s.shop))
            .filter((s: any) => s.shop.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [knownShops, blacklist, searchTerm]);

    return (
        <div className="blacklist-page">
            <style>{`
                .blacklist-page { animation: fadeIn 0.4s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                
                .header-section { margin-bottom: 32px; }
                .header-section h1 { font-size: 28px; font-weight: 800; color: #1e293b; letter-spacing: -0.02em; margin-bottom: 8px; }
                .header-section p { color: #64748b; font-size: 15px; }

                .grid-layout { display: grid; grid-template-columns: 1fr 380px; gap: 32px; align-items: start; }

                .card-v3 { background: white; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden; }
                .card-header { padding: 24px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; }
                .card-header h3 { font-size: 18px; font-weight: 700; color: #1e293b; }
                
                .blacklist-table { width: 100%; border-collapse: collapse; }
                .blacklist-table th { text-align: left; padding: 16px 24px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
                .blacklist-table td { padding: 16px 24px; border-top: 1px solid #f1f5f9; font-size: 14px; color: #334155; }
                .blacklist-table tr:hover td { background: #fcfdfe; }

                .shop-badge { display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b; }
                .shop-icon { padding: 6px; background: #eff6ff; color: #3b82f6; border-radius: 8px; }

                .btn-delete { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 8px; border-radius: 8px; transition: all 0.2s; }
                .btn-delete:hover { background: #fef2f2; color: #ef4444; }

                .form-section { padding: 24px; }
                .instruction-box { background: #fffbeb; border: 1px solid #fef3c7; padding: 16px; border-radius: 12px; margin-bottom: 24px; display: flex; gap: 12px; }
                .instruction-box p { font-size: 13px; color: #92400e; line-height: 1.5; }

                .input-group { margin-bottom: 20px; }
                .input-group label { display: block; font-size: 13px; font-weight: 600; color: #64748b; margin-bottom: 8px; }
                
                .select-premium { width: 100%; padding: 12px 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-family: inherit; font-size: 14px; background: #f8fafc; transition: all 0.2s; }
                .select-premium:focus { border-color: #6366f1; background: white; outline: none; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

                .input-premium { width: 100%; padding: 12px 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-family: inherit; font-size: 14px; background: #f8fafc; transition: all 0.2s; }
                .input-premium:focus { border-color: #6366f1; background: white; outline: none; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

                .divider { text-align: center; margin: 24px 0; position: relative; }
                .divider::before { content: ""; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #e2e8f0; z-index: 1; }
                .divider span { position: relative; z-index: 2; background: white; padding: 0 12px; color: #94a3b8; font-size: 12px; font-weight: 700; text-transform: uppercase; }

                .btn-add { width: 100%; background: #1e293b; color: white; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 10px; }
                .btn-add:hover { background: #0f172a; transform: translateY(-1px); }
                .btn-add:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

                @media (max-width: 1100px) {
                    .grid-layout { grid-template-columns: 1fr; }
                    .form-section-sticky { position: static !important; }
                }

                .empty-state { padding: 60px 40px; text-align: center; color: #94a3b8; }
                .empty-icon { margin: 0 auto 16px; width: 64px; height: 64px; background: #f8fafc; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #cbd5e1; }
            `}</style>
            

            <div className="grid-layout">
                {/* Left: Blacklist Table */}
                <div className="card-v3">
                    <div className="card-header">
                        <ShieldAlert className="shop-icon" style={{ background: '#fef2f2', color: '#ef4444' }} />
                        <h3>Blacklisted Stores</h3>
                    </div>
                    
                    {blacklist.length > 0 ? (
                        <table className="blacklist-table">
                            <thead>
                                <tr>
                                    <th>Store Domain</th>
                                    <th>Added Date</th>
                                    <th style={{ width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {blacklist.map((item: any) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="shop-badge">
                                                <div className="shop-icon"><Store size={14} /></div>
                                                {item.shop}
                                            </div>
                                        </td>
                                        <td style={{ color: '#64748b' }}>
                                            {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td>
                                            <Form method="post">
                                                <input type="hidden" name="id" value={item.id} />
                                                <input type="hidden" name="_action" value="delete" />
                                                <button type="submit" className="btn-delete" title="Remove from blacklist">
                                                    <Trash2 size={18} />
                                                </button>
                                            </Form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon"><ShieldAlert size={32} /></div>
                            <p style={{ fontWeight: 600, fontSize: '16px', color: '#64748b' }}>No shops blacklisted</p>
                            <p style={{ fontSize: '13px', marginTop: '4px' }}>All shops will receive automated emails.</p>
                        </div>
                    )}
                </div>

                {/* Right: Add Form */}
                <div className="form-section-sticky" style={{ position: 'sticky', top: '100px' }}>
                    <div className="card-v3">
                        <div className="card-header">
                            <Plus size={20} color="#6366f1" />
                            <h3>Add to Blacklist</h3>
                        </div>
                        
                        <div className="form-section">
                            <div className="instruction-box">
                                <Info size={20} style={{ flexShrink: 0 }} />
                                <p>Blacklisted shops will not receive Welcome, 80%, or 100% usage emails.</p>
                            </div>

                            <Form method="post">
                                <input type="hidden" name="_action" value="add" />
                                
                                <div className="input-group">
                                    <label>Select from known shops</label>
                                    <select 
                                        name="shop" 
                                        className="select-premium"
                                        value={selectedShop}
                                        onChange={(e) => {
                                            setSelectedShop(e.target.value);
                                            if (e.target.value) setManualShop("");
                                        }}
                                    >
                                        <option value="">-- Choose a store --</option>
                                        {availableShops.map((s: any) => (
                                            <option key={s.shop} value={s.shop}>{s.shop}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="divider">
                                    <span>OR</span>
                                </div>

                                <div className="input-group">
                                    <label>Enter domain manually</label>
                                    <input 
                                        type="text" 
                                        name="shop" 
                                        className="input-premium" 
                                        placeholder="e.g. store.myshopify.com"
                                        value={manualShop}
                                        onChange={(e) => {
                                            setManualShop(e.target.value);
                                            if (e.target.value) setSelectedShop("");
                                        }}
                                    />
                                </div>

                                <button 
                                    type="submit" 
                                    className="btn-add" 
                                    disabled={isSubmitting || (!selectedShop && !manualShop)}
                                >
                                    {isSubmitting ? "Adding..." : <><Plus size={18} /> Add to Blacklist</>}
                                </button>

                                {actionData?.error && (
                                    <div style={{ marginTop: '16px', padding: '12px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', fontSize: '13px', display: 'flex', gap: '8px' }}>
                                        <XCircle size={16} /> {actionData.error}
                                    </div>
                                )}
                                {actionData?.success && (
                                    <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', color: '#15803d', borderRadius: '8px', fontSize: '13px', display: 'flex', gap: '8px' }}>
                                        <CheckCircle size={16} /> {actionData.message}
                                    </div>
                                )}
                            </Form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
