
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
        const yearStart = new Date(now.getFullYear(), 0, 1);

        const [
            totalShops,
            activeRules,
            totalVisitors,
            countryStats,
            settings,
            trendRows
        ] = await Promise.all([
            prisma.settings.count({ where: { NOT: { shop: 'GLOBAL' } } }),
            prisma.redirectRule.count({ where: { isActive: true } }),
            prisma.analyticsCountry.aggregate({ _sum: { visitors: true } }),
            prisma.analyticsCountry.groupBy({
                by: ['countryCode'],
                _sum: { visitors: true, redirected: true },
                orderBy: { _sum: { visitors: 'desc' } },
                take: 5
            }),
            prisma.settings.findMany({
                where: { NOT: { shop: 'GLOBAL' } },
                select: { shop: true, currentPlan: true, mode: true, customPlanPrice: true, billingPeriodKey: true },
            }),
            prisma.analyticsCountry.findMany({
                where: { date: { gte: yearStart } },
                select: { date: true, visitors: true, redirected: true },
            })
        ]);

        const trendMap = new Map<string, { totalVisitors: number; redirected: number }>();
        (trendRows as any[]).forEach((row) => {
            const rowMonth = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}`;
            const current = trendMap.get(rowMonth) || { totalVisitors: 0, redirected: 0 };
            current.totalVisitors += row.visitors || 0;
            current.redirected += row.redirected || 0;
            trendMap.set(rowMonth, current);
        });
        const monthlyTrends = Array.from(trendMap.entries())
            .map(([trendMonth, sums]) => ({
                yearMonth: trendMonth,
                _sum: {
                    totalVisitors: sums.totalVisitors,
                    redirected: sums.redirected,
                },
            }))
            .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

        const currentPeriodKeys = settings.map((s: any) => s.billingPeriodKey || `calendar:${yearMonth}`);
        const currentPeriodUsage = await prisma.monthlyUsage.findMany({
            where: { billingPeriodKey: { in: currentPeriodKeys } },
        });

        // 1. Calculate Subscription Revenue
        const planPrices: Record<string, number> = {
            'ELITE': 14.99,
            'PLUS': 7.99,
            'PREMIUM': 4.99,
            'FREE': 0
        };
        const OVERAGE_RATE = 100 / 50000; // $0.002

        const subscriptionRevenue = settings.reduce((sum, s) => {
            const planKey = (s.currentPlan || 'FREE').toUpperCase();
            if (planKey === 'CUSTOM') return sum + Number(s.customPlanPrice || 0);
            return sum + (planPrices[planKey] || 0);
        }, 0);

        // 2. Calculate Overage Revenue (Current Month)
        const usageMap = new Map((currentPeriodUsage as any[]).map(u => [`${u.shop}:${u.billingPeriodKey}`, u]));
        const overageRevenue = settings.reduce((sum, s) => {
            const planKey = (s.currentPlan || 'FREE').toUpperCase();
            if (planKey === 'FREE') return sum;

            const usage = usageMap.get(`${s.shop}:${(s as any).billingPeriodKey || `calendar:${yearMonth}`}`);
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
        }, { 'FREE': 0, 'PREMIUM': 0, 'PLUS': 0, 'ELITE': 0, 'CUSTOM': 0 });

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
            trends: monthlyTrends
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
                    gap: 20px; 
                }
                .grid-stats { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); 
                    gap: 16px; 
                    margin-bottom: 20px; 
                }
                
                .premium-card {
                    background: white; border-radius: 8px; border: 1px solid var(--border);
                    padding: 22px; box-shadow: none;
                    position: relative; overflow: hidden;
                    transition: none;
                }
                .premium-card:hover { transform: none; }
                
                .stat-icon {
                    width: 40px; height: 40px; border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 20px; margin-bottom: 16px;
                }
                
                .trend-chart { width: 100%; height: 120px; margin-top: 20px; }
                
                .list-item {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 16px 0; border-bottom: 1px solid #f1f5f9;
                }
                .list-item:last-child { border-bottom: none; }
                
                .progress-bar { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; flex: 1; margin: 0 16px; }
                .progress-fill { height: 100%; background: var(--primary); border-radius: 4px; }

                .plan-tag {
                    padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 700;
                    background: #f8fafc; border: 1px solid #e2e8f0; color: #475569;
                }

                @media (max-width: 1200px) {
                    .grid-main { grid-template-columns: 1fr; }
                }

                @media (max-width: 768px) {
                    .grid-main { gap: 16px; }
                    .grid-stats { grid-template-columns: 1fr; gap: 12px; margin-bottom: 16px; }
                    .premium-card { padding: 16px; border-radius: 8px; }
                    .stat-icon { width: 40px; height: 40px; font-size: 20px; margin-bottom: 16px; }
                    .grid-stats .premium-card div:nth-child(3) { font-size: 28px !important; }
                    .traffic-bars { height: 190px !important; gap: 4px !important; overflow-x: auto; padding-bottom: 0 !important; }
                    .traffic-bars > div { min-width: 26px; }
                    .list-item { padding: 12px 0; gap: 8px; }
                    .progress-bar { margin: 0 10px; }
                }

                @media (max-width: 480px) {
                    .traffic-bars > div { min-width: 24px; }
                    .grid-stats .premium-card div:nth-child(3) { font-size: 24px !important; }
                }
            `}</style>

            <div className="grid-stats">
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><Store size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Total Installations</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: 'var(--admin-text)' }}>{stats.totalShops}</div>
                    <div style={{ fontSize: '12px', color: 'var(--admin-faint)', marginTop: '4px' }}>All time</div>
                </div>
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}><TrendingUp size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Global Traffic</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: 'var(--admin-text)' }}>{stats.totalVisitors.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: 'var(--admin-faint)', marginTop: '4px' }}>Real-time aggregated</div>
                </div>
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Store size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Active Rules</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: 'var(--admin-text)' }}>{stats.activeRules}</div>
                    <div style={{ fontSize: '12px', color: 'var(--admin-faint)', marginTop: '4px' }}>Currently active redirects</div>
                </div>
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#fce7f3', color: '#db2777' }}><Gem size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Total Revenue</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: 'var(--admin-text)' }}>${stats.totalRevenue.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--admin-faint)', marginTop: '8px', lineHeight: '1.4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subscriptions:</span> <span style={{fontWeight:600}}>${stats.subscriptionRevenue.toFixed(2)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop:'4px' }}><span>Overage:</span> <span style={{fontWeight:600}}>${stats.overageRevenue.toFixed(2)}</span></div>
                    </div>
                </div>
            </div>

            <div className="grid-main">
                <div className="premium-card">
                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Traffic Growth Trend</h3>
                    <div className="traffic-bars" style={{ height: '260px', width: '100%', display: 'flex', alignItems: 'flex-end', gap: '6px', padding: '0', borderBottom: '1px solid var(--admin-border)' }}>
                        {fullYearTrends.map((t: any) => {
                            const total = t._sum?.totalVisitors || 0;
                            const maxVal = Math.max(...fullYearTrends.map((x: any) => x._sum?.totalVisitors || 0)) || 1;
                            const heightPercentage = total > 0 ? Math.max((total / maxVal) * 100, 4) : 0;
                            
                            return (
                                <div key={t.yearMonth} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', position: 'relative' }}>
                                    {total > 0 && (
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#0ea5e9', marginBottom: '4px' }}>
                                            {total > 1000 ? (total / 1000).toFixed(1) + 'k' : total}
                                        </div>
                                    )}
                                    <div 
                                        title={`${t.yearMonth}: ${total.toLocaleString()}`}
                                        style={{ 
                                            width: '70%', 
                                            height: `${(heightPercentage / 100) * 180}px`,
                                            background: total > 0 ? 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)' : 'transparent',
                                            borderRadius: '6px 6px 2px 2px',
                                            transition: 'none',
                                            boxShadow: 'none',
                                            minHeight: total > 0 ? '4px' : '0'
                                        }} 
                                    />
                                    <div style={{ fontSize: '10px', color: 'var(--admin-muted)', fontWeight: 800, paddingBottom: '8px' }}>{t.yearMonth.split('-')[1]}</div>
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
                                    <div className="progress-fill" style={{ width: `${stats.totalVisitors > 0 ? (c.visitors / stats.totalVisitors) * 100 : 0}%`, background: "linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)" }} />
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 600 }}>{stats.totalVisitors > 0 ? ((c.visitors / stats.totalVisitors) * 100).toFixed(1) : '0.0'}%</div>
                            </div>
                        ))}
                    </div>

                    <div className="premium-card">
                        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Plan Distribution</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            {Object.entries(distributions.plans).map(([plan, count]: [any, any]) => (
                                <div key={plan} style={{ flex: 1, minWidth: '100px', textAlign: 'center', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-soft)' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--admin-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>{plan}</div>
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


