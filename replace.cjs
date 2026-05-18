const fs = require('fs');
const file = 'app/routes/admin._index.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacement = `<div className="grid-stats">
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}><Store size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Total Installations</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: '#0f172a' }}>{stats.totalShops}</div>
                    <div style={{ fontSize: '12px', color: 'var(--admin-faint)', marginTop: '4px' }}>All time</div>
                </div>
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#ecfdf5', color: '#059669' }}><TrendingUp size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Global Traffic</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: '#0f172a' }}>{stats.totalVisitors.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: 'var(--admin-faint)', marginTop: '4px' }}>Real-time aggregated</div>
                </div>
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Store size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Active Rules</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: '#0f172a' }}>{stats.activeRules}</div>
                    <div style={{ fontSize: '12px', color: 'var(--admin-faint)', marginTop: '4px' }}>Currently active redirects</div>
                </div>
                <div className="premium-card">
                    <div className="stat-icon" style={{ background: '#fce7f3', color: '#db2777' }}><Gem size={22} /></div>
                    <div style={{ fontSize: '14px', color: 'var(--admin-muted)', fontWeight: 600 }}>Total Revenue</div>
                    <div style={{ fontSize: '32px', fontWeight: 800, marginTop: '8px', color: '#0f172a' }}>\${stats.totalRevenue.toFixed(2)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--admin-faint)', marginTop: '8px', lineHeight: '1.4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subscriptions:</span> <span style={{fontWeight:600}}>\${stats.subscriptionRevenue.toFixed(2)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop:'4px' }}><span>Overage:</span> <span style={{fontWeight:600}}>\${stats.overageRevenue.toFixed(2)}</span></div>
                    </div>
                </div>
            </div>`;

content = content.replace(/<div className="grid-stats">[\s\S]*?<\/div>\s*<\/div>\s*<div className="grid-main">/, replacement + '\n\n            <div className="grid-main">');

// Now replace the traffic bars gradient
content = content.replace(/background: total > 0 \? '#2563eb' : 'transparent',/g, "background: total > 0 ? 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)' : 'transparent',");
content = content.replace(/color: '#6366f1'/g, "color: '#0ea5e9'");
content = content.replace(/fontSize: '9px'/g, "fontSize: '10px'");
content = content.replace(/color: 'var\(--text-muted\)'/g, "color: 'var(--admin-muted)'");
content = content.replace(/borderBottom: '1px solid #f1f5f9'/g, "borderBottom: '1px solid var(--admin-border)'");
content = content.replace(/color: '#0f172a'/g, "color: 'var(--admin-text)'");

// Market distribution progress bar
content = content.replace(/<div className="progress-fill" style={{ width: `\$\{stats\.totalVisitors > 0 \? \(c\.visitors \/ stats\.totalVisitors\) \* 100 : 0\}%` }} \/>/g, 
  '<div className="progress-fill" style={{ width: `${stats.totalVisitors > 0 ? (c.visitors / stats.totalVisitors) * 100 : 0}%`, background: "linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)" }} />');

fs.writeFileSync(file, content);
