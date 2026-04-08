
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import { Store, TrendingUp, Gem } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    const [
        totalShops,
        activeRules,
        totalVisitors,
        countryStats,
        settings,
        monthlyTrends
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
        prisma.settings.findMany({ select: { currentPlan: true, mode: true } }),
        prisma.monthlyUsage.groupBy({
            by: ['yearMonth'],
            _sum: { totalVisitors: true, redirected: true },
            orderBy: { yearMonth: 'desc' },
            take: 12
        })
    ]);

    // Calculate distributions
    const plans = settings.reduce((acc: any, s) => {
        acc[s.currentPlan] = (acc[s.currentPlan] || 0) + 1;
        return acc;
    }, {});

    // Est. Revenue
    // Plus: $8, Premium: $5 (Based on UI screenshots found in codebase)
    const revenueMap: Record<string, number> = {
        'PLUS': 8,
        'PREMIUM': 5,
        'FREE': 0
    };
    
    // Normalize currentPlan to uppercase to match revenueMap keys regardless of DB storage case
    const totalRevenue = settings.reduce((sum, s) => {
        const planKey = (s.currentPlan || 'FREE').toUpperCase();
        return sum + (revenueMap[planKey] || 0);
    }, 0);

    const modes = settings.reduce((acc: any, s) => {
        acc[s.mode] = (acc[s.mode] || 0) + 1;
        return acc;
    }, {});

    return json({ 
        stats: {
            totalShops,
            activeRules,
            totalVisitors: totalVisitors._sum.visitors || 0,
            estMonthlyRevenue: totalRevenue
        },
        countries: countryStats.map(c => ({
            code: c.countryCode,
            visitors: c._sum.visitors || 0,
            redirects: c._sum.redirected || 0
        })),
        distributions: { plans, modes },
        trends: monthlyTrends.reverse()
    });
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
                    <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Est. Monthly Revenue</div>
                    <div style={{ fontSize: '36px', fontWeight: 800, marginTop: '8px' }}>${stats.estMonthlyRevenue.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginTop: '8px', fontWeight: 600 }}>Based on plan distribution</div>
                </div>
            </div>

            <div className="grid-main">
                <div className="premium-card">
                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Traffic Growth Trend</h3>
                    <div style={{ height: '240px', width: '100%', display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '0 0 20px 0' }}>
                        {fullYearTrends.map((t: any) => {
                            const total = t._sum?.totalVisitors || 0;
                            const maxVal = Math.max(...fullYearTrends.map((x: any) => x._sum?.totalVisitors || 0)) || 1;
                            const heightPercentage = Math.max((total / maxVal) * 100, 5);
                            
                            return (
                                <div key={t.yearMonth} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    <div 
                                        title={`${t.yearMonth}: ${total.toLocaleString()}`}
                                        style={{ 
                                            width: '60%', 
                                            height: `${(heightPercentage / 100) * 180}px`,
                                            background: 'linear-gradient(180deg, #6366f1 0%, #a855f7 100%)',
                                            borderRadius: '6px 6px 2px 2px',
                                            transition: 'height 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                                            boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)',
                                            position: 'relative',
                                            minWidth: '4px'
                                        }} 
                                    />
                                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>{t.yearMonth.split('-')[1]}</div>
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


