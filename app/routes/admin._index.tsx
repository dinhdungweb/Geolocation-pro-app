
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import { Store, TrendingUp, Gem } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    try {
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const [
            totalShops,
            activeRules,
            totalVisitors,
            countryStats,
            settings,
            monthlyTrends,
            currentMonthUsage
        ] = await Promise.all([
            prisma.settings.count(),
            prisma.redirectRule.count({ where: { isActive: true } }),
            prisma.analyticsCountry.aggregate({ _sum: { visitors: true } }),
            prisma.analyticsCountry.groupBy({
                by: ['countryCode'],
                _sum: { visitors: true, redirected: true },
                orderBy: { _sum: { visitors: 'desc' } },
                take: 5
            }),
            prisma.settings.findMany({ select: { shop: true, currentPlan: true, mode: true } }),
            prisma.monthlyUsage.groupBy({
                by: ['yearMonth'],
                _sum: { totalVisitors: true, redirected: true },
                orderBy: { yearMonth: 'desc' },
                take: 12
            }),
            (prisma as any).monthlyUsage.findMany({
                where: { yearMonth }
            })
        ]);

        // 1. Calculate Subscription Revenue
        const planPrices: Record<string, number> = {
            'ELITE': 14.99,
            'PLUS': 7.99,
            'PREMIUM': 4.99,
            'FREE': 0
        };
        const planLimits: Record<string, number> = {
            'ELITE': 6000,
            'PLUS': 2500,
            'PREMIUM': 1000,
            'FREE': 100
        };
        const OVERAGE_RATE = 100 / 50000; // $0.002

        const subscriptionRevenue = settings.reduce((sum, s) => {
            const planKey = (s.currentPlan || 'FREE').toUpperCase();
            return sum + (planPrices[planKey] || 0);
        }, 0);

        // 2. Calculate Overage Revenue (Current Month)
        const usageMap = new Map((currentMonthUsage as any[]).map(u => [u.shop, u]));
        const overageRevenue = settings.reduce((sum, s) => {
            const planKey = (s.currentPlan || 'FREE').toUpperCase();
            if (planKey === 'FREE') return sum;

            const limit = planLimits[planKey] || 100;
            const usage = usageMap.get(s.shop);
            if (!usage) return sum;

            // Only count successfully charged visitors in revenue
            const chargedAmount = (usage.chargedVisitors || 0) * OVERAGE_RATE;
            return sum + chargedAmount;
        }, 0);

        // Calculate distributions
        const plans = settings.reduce((acc: any, s) => {
            const planKey = (s.currentPlan || 'FREE').toUpperCase();
            acc[planKey] = (acc[planKey] || 0) + 1;
            return acc;
        }, { 'FREE': 0, 'PREMIUM': 0, 'PLUS': 0, 'ELITE': 0 });

        const modes = settings.reduce((acc: any, s) => {
            const modeKey = s.mode || 'popup';
            acc[modeKey] = (acc[modeKey] || 0) + 1;
            return acc;
        }, {});

        return json({ 
            stats: {
                totalShops,
                activeRules,
                totalVisitors: totalVisitors._sum.visitors || 0,
                subscriptionRevenue,
                overageRevenue,
                totalRevenue: subscriptionRevenue + overageRevenue
            },
            countries: countryStats.map(c => ({
                code: c.countryCode,
                visitors: c._sum.visitors || 0,
                redirects: c._sum.redirected || 0
            })),
            distributions: { plans, modes },
            trends: monthlyTrends.reverse()
        });
    } catch (error) {
        console.error("Dashboard Loader Error:", error);
        return json({
            stats: { totalShops: 0, activeRules: 0, totalVisitors: 0, subscriptionRevenue: 0, overageRevenue: 0, totalRevenue: 0 },
            countries: [],
            distributions: { plans: {}, modes: {} },
            trends: []
        });
    }
};

// Helper to fill all 12 months of the current year
function getFullYearTrends(monthlyTrends: any[]) {
    const currentYear = new Date().getFullYear();
    const fullYear: any[] = [];
    
    for (let month = 1; month <= 12; month++) {
        const yearMonth = `${currentYear}-${String(month).padStart(2, '0')}`;
        const existing = monthlyTrends.find(t => t.yearMonth === yearMonth);
        
        fullYear.push(existing || {
            yearMonth,
            _sum: { totalVisitors: 0, redirected: 0 }
        });
    }
    
    return fullYear;
}

export default function AdminDashboard() {
    const { stats, countries, distributions, trends } = useLoaderData<typeof loader>();
    const fullYearTrends = getFullYearTrends(trends);

    return (
        <div className="dashboard-v2">
            <style>{`
                .grid-main { 
                    display: grid; 
                    grid-template-columns: 2fr 1fr; 
                    gap: 32px; 
                }
                .grid-stats { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
                    gap: 24px; 
                    margin-bottom: 32px; 
                }
                
                .premium-card {
                    background: white; border-radius: 30px; border: 1px solid var(--border);
                    padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.02);
                    position: relative; overflow: hidden;
                    transition: transform 0.3s ease;
                }
                .premium-card:hover { transform: translateY(-5px); }
                
                .stat-icon {
                    width: 50px; height: 50px; border-radius: 15px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 24px; margin-bottom: 20px;
                }
                
                .trend-chart { width: 100%; height: 120px; margin-top: 20px; }
                
                .list-item {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 16px 0; border-bottom: 1px solid #f1f5f9;
                }
                .list-item:last-child { border-bottom: none; }
                
                .progress-bar { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; flex: 1; margin: 0 16px; }
                .progress-fill { height: 100%; background: var(--primary-gradient); border-radius: 4px; }

                .plan-tag {
                    padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
                    background: #f8fafc; border: 1px solid #e2e8f0; color: #475569;
                }

                @media (max-width: 1200px) {
                    .grid-main { grid-template-columns: 1fr; }
                }

                @media (max-width: 768px) {
                    .grid-stats { grid-template-columns: 1fr; gap: 16px; }
                    .premium-card { padding: 24px; border-radius: 20px; }
                    .stat-icon { width: 40px; height: 40px; font-size: 20px; margin-bottom: 16px; }
                    .grid-stats .premium-card div:nth-child(3) { font-size: 28px !important; }
                }
            `}</style>

            <div className="grid-stats">
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><Store size={24} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Installations</div>
                    <div style={{ fontSize: '36px', fontWeight: 800, marginTop: '8px' }}>{stats.totalShops}</div>
                    <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px', fontWeight: 600 }}>↑ 12% from last month</div>
                </div>
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#ecfdf5', color: '#10b981' }}><TrendingUp size={24} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>Global Traffic</div>
                    <div style={{ fontSize: '36px', fontWeight: 800, marginTop: '8px' }}>{stats.totalVisitors.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Real-time aggregated</div>
                </div>
                <div className="premium-card" style={{ background: 'var(--primary-gradient)', color: 'white', border: 'none' }}>
                    <div className="stat-icon" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}><Gem size={24} /></div>
                    <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Total Revenue (This Month)</div>
                    <div style={{ fontSize: '36px', fontWeight: 800, marginTop: '8px' }}>${stats.totalRevenue.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', marginTop: '8px', lineHeight: '1.4' }}>
                        <div>• Subscriptions: ${stats.subscriptionRevenue.toFixed(2)}</div>
                        <div>• Overage: ${stats.overageRevenue.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div className="grid-main">
                <div className="premium-card">
                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Traffic Growth Trend</h3>
                    <div style={{ height: '260px', width: '100%', display: 'flex', alignItems: 'flex-end', gap: '6px', padding: '0', borderBottom: '1px solid #f1f5f9' }}>
                        {fullYearTrends.map((t: any) => {
                            const total = t._sum?.totalVisitors || 0;
                            const maxVal = Math.max(...fullYearTrends.map((x: any) => x._sum?.totalVisitors || 0)) || 1;
                            const heightPercentage = total > 0 ? Math.max((total / maxVal) * 100, 4) : 0;
                            
                            return (
                                <div key={t.yearMonth} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', position: 'relative' }}>
                                    {total > 0 && (
                                        <div style={{ fontSize: '9px', fontWeight: 800, color: '#6366f1', marginBottom: '4px' }}>
                                            {total > 1000 ? (total / 1000).toFixed(1) + 'k' : total}
                                        </div>
                                    )}
                                    <div 
                                        title={`${t.yearMonth}: ${total.toLocaleString()}`}
                                        style={{ 
                                            width: '70%', 
                                            height: `${(heightPercentage / 100) * 180}px`,
                                            background: total > 0 ? 'linear-gradient(180deg, #6366f1 0%, #a855f7 100%)' : 'transparent',
                                            borderRadius: '6px 6px 2px 2px',
                                            transition: 'height 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: total > 0 ? '0 4px 10px rgba(99, 102, 241, 0.2)' : 'none',
                                            minHeight: total > 0 ? '4px' : '0'
                                        }} 
                                    />
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, paddingBottom: '8px' }}>{t.yearMonth.split('-')[1]}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div className="premium-card">
                        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Market Distribution</h3>
                        {countries.map(c => (
                            <div className="list-item" key={c.code}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '60px' }}>
                                    <img src={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png`} width="20" alt={c.code} />
                                    <span style={{ fontWeight: 700, fontSize: '13px' }}>{c.code}</span>
                                </div>
                                <div className="progress-bar">
                                    <div className="progress-fill" style={{ width: `${(c.visitors / stats.totalVisitors) * 100}%` }} />
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 600 }}>{((c.visitors / stats.totalVisitors) * 100).toFixed(1)}%</div>
                            </div>
                        ))}
                    </div>

                    <div className="premium-card">
                        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Plan Distribution</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            {Object.entries(distributions.plans).map(([plan, count]: [any, any]) => (
                                <div key={plan} style={{ flex: 1, minWidth: '100px', textAlign: 'center', padding: '16px', background: '#f8fafc', borderRadius: '16px' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>{plan}</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800 }}>{count}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


