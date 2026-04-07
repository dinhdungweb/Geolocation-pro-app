import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Form } from "@remix-run/react";
import { useState, useMemo } from "react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { sendAdminEmail } from "../utils/email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    const [shops, logs] = await Promise.all([
        prisma.session.findMany({
            select: { shop: true, email: true },
            distinct: ['shop'],
        }),
        (prisma as any).adminEmailLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        })
    ]);

    // Get current plan for each shop from Settings
    const settings = await prisma.settings.findMany({
        select: { shop: true, currentPlan: true }
    });

    const shopMap = shops.map(s => {
        const setting = settings.find(st => st.shop === s.shop);
        return {
            ...s,
            plan: setting?.currentPlan || 'free'
        };
    });

    return json({ shops: shopMap, logs });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "sendEmail") {
        const selectedShops = formData.getAll("selectedShops") as string[];
        const subject = formData.get("subject") as string;
        const html = formData.get("body") as string;

        if (!selectedShops.length || !subject || !html) {
            return json({ success: false, error: "Thiếu thông tin (Shops, Chủ đề hoặc Nội dung)" }, { status: 400 });
        }

        const results = [];
        for (const shop of selectedShops) {
            const res = await sendAdminEmail({
                shop,
                type: 'manual',
                subject,
                html
            });
            results.push({ shop, ...res });
        }

        const successCount = results.filter(r => r.success).length;
        return json({ success: true, message: `Đã gửi thành công ${successCount}/${selectedShops.length} email.` });
    }

    return json({ success: false, error: "Hành động không hợp lệ" }, { status: 400 });
};

export default function EmailMarketing() {
    const { shops, logs } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedShops, setSelectedShops] = useState<string[]>([]);
    
    const filteredShops = useMemo(() => {
        return shops.filter(s => 
            s.shop.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (s.email?.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [shops, searchTerm]);

    const handleSelectAll = () => {
        if (selectedShops.length === filteredShops.length) {
            setSelectedShops([]);
        } else {
            setSelectedShops(filteredShops.map(s => s.shop));
        }
    };

    const toggleShop = (shop: string) => {
        if (selectedShops.includes(shop)) {
            setSelectedShops(selectedShops.filter(s => s !== shop));
        } else {
            setSelectedShops([...selectedShops, shop]);
        }
    };

    const isSending = fetcher.state !== "idle";

    return (
        <div className="email-marketing">
            <style>{`
                .email-grid { 
                    display: grid; 
                    grid-template-columns: 350px 1fr; 
                    gap: 24px; 
                    padding: 24px; 
                }
                .shop-list-card { 
                    background: white; 
                    border: 1px solid #e1e1e1; 
                    border-radius: 12px; 
                    display: flex; 
                    flex-direction: column; 
                    max-height: 800px; 
                }
                .composer-card { 
                    background: white; 
                    border: 1px solid #e1e1e1; 
                    border-radius: 12px; 
                    padding: 24px; 
                }
                .search-box { padding: 16px; border-bottom: 1px solid #eee; }
                .search-box input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; }
                .shops-scroll { overflow-y: auto; flex: 1; }
                .shop-item { padding: 12px 16px; border-bottom: 1px solid #f5f5f5; display: flex; align-items: center; gap: 12px; cursor: pointer; }
                .shop-item:hover { background: #f9f9f9; }
                .shop-item.selected { background: #f0f7ff; }
                
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px; }
                .form-group input, .form-group textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-family: inherit; }
                .form-group textarea { min-height: 300px; resize: vertical; }
                
                .btn-send { background: #008060; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; cursor: pointer; width: 100%; transition: opacity 0.2s; }
                .btn-send:hover { opacity: 0.9; }
                .btn-send:disabled { background: #ccc; cursor: not-allowed; }

                .history-section { padding: 0 24px 24px; width: 100%; }
                .history-table-container { width: 100%; overflow-x: auto; background: white; border: 1px solid #e1e1e1; border-radius: 12px; margin-top: 12px; }
                .history-table { width: 100%; border-collapse: collapse; min-width: 800px; }
                .history-table th { text-align: left; padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #eee; font-size: 12px; text-transform: uppercase; color: #666; }
                .history-table td { padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; }
                .status-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap; }
                .status-sent { background: #e6fcf5; color: #0ca678; }
                .status-simulated { background: #fff4e6; color: #f76707; }
                .status-failed { background: #fff5f5; color: #fa5252; }

                @media (max-width: 900px) {
                    .email-grid { grid-template-columns: 1fr; padding: 16px; }
                    .shop-list-card { max-height: 400px; }
                    .history-section { padding: 0 16px 16px; }
                    .composer-card { padding: 16px; }
                }
            `}</style>

            <div className="email-grid">
                {/* Shop Selector */}
                <div className="shop-list-card">
                    <div className="search-box">
                        <input 
                            type="text" 
                            placeholder="Tìm kiếm shop hoặc email..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: '#666' }}>{selectedShops.length} đã chọn</span>
                            <button onClick={handleSelectAll} style={{ fontSize: '13px', color: '#0066cc', border: 'none', background: 'none', cursor: 'pointer' }}>
                                {selectedShops.length === filteredShops.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                            </button>
                        </div>
                    </div>
                    <div className="shops-scroll">
                        {filteredShops.map(s => (
                            <div 
                                key={s.shop} 
                                className={`shop-item ${selectedShops.includes(s.shop) ? 'selected' : ''}`}
                                onClick={() => toggleShop(s.shop)}
                            >
                                <input type="checkbox" checked={selectedShops.includes(s.shop)} readOnly />
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.shop}</div>
                                    <div style={{ fontSize: '12px', color: '#888' }}>{s.email || 'No email'} · <span style={{ textTransform: 'capitalize' }}>{s.plan}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Email Composer */}
                <div className="composer-card">
                    <h2 style={{ marginBottom: '20px', fontSize: '18px', fontWeight: 600 }}>Chiến dịch Email mới</h2>
                    <fetcher.Form method="post">
                        <input type="hidden" name="actionType" value="sendEmail" />
                        {selectedShops.map(s => (
                            <input key={s} type="hidden" name="selectedShops" value={s} />
                        ))}

                        <div className="form-group">
                            <label>Chủ đề Email</label>
                            <input 
                                type="text" 
                                name="subject" 
                                placeholder="VD: Khuyến mãi đặc biệt dành riêng cho bạn!" 
                                required 
                            />
                        </div>

                        <div className="form-group">
                            <label>Nội dung (HTML)</label>
                            <textarea 
                                name="body" 
                                placeholder="<h1>Xin chào!</h1><p>Nội dung email của bạn tại đây...</p>" 
                                required
                            ></textarea>
                        </div>

                        <button 
                            type="submit" 
                            className="btn-send"
                            disabled={isSending || selectedShops.length === 0}
                        >
                            {isSending ? "Đang gửi..." : `Gửi đến ${selectedShops.length} Shop`}
                        </button>

                        {fetcher.data?.message && (
                            <div style={{ marginTop: '16px', padding: '12px', borderRadius: '6px', background: fetcher.data.success ? '#e6fcf5' : '#fff5f5', color: fetcher.data.success ? '#0ca678' : '#fa5252', fontSize: '14px' }}>
                                {fetcher.data.message}
                            </div>
                        )}
                    </fetcher.Form>
                </div>
            </div>

            {/* History Section */}
            <div className="history-section">
                <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Lịch sử Email</h2>
                <div className="history-table-container">
                    <table className="history-table">
                        <thead>
                            <tr>
                                <th>Ngày gửi</th>
                                <th>Shop</th>
                                <th>Loại</th>
                                <th>Chủ đề</th>
                                <th>Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log: any) => (
                                <tr key={log.id}>
                                    <td>{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                                    <td>{log.shop}</td>
                                    <td><span style={{ textTransform: 'capitalize' }}>{log.type}</span></td>
                                    <td>{log.subject}</td>
                                    <td>
                                        <span className={`status-badge status-${log.status}`}>
                                            {log.status === 'sent' ? 'Đã gửi' : log.status === 'simulated' ? 'Giả lập' : 'Thất bại'}
                                        </span>
                                        {log.error && <div style={{ fontSize: '10px', color: 'red', marginTop: '4px' }}>{log.error}</div>}
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#999' }}>Chưa có lịch sử gửi email.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
