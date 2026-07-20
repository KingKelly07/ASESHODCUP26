import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Trophy, Calendar, BarChart3, ShieldCheck, Plus, CheckCircle, Clock, Trash2, Edit3, ChevronRight, Goal } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { supabase } from './supabase';

// ==========================================
// CONTEXT & STATE MANAGEMENT (LIVE DB)
// ==========================================
const LeagueContext = createContext();

const LeagueProvider = ({ children }) => {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [teamsRes, playersRes, matchesRes] = await Promise.all([
      supabase.from('teams').select('*'),
      supabase.from('players').select('*'),
      supabase.from('matches').select('*').order('matchDate', { ascending: true, nullsFirst: false })
    ]);
    
    setTeams(teamsRes.data || []);
    setPlayers(playersRes.data || []);
    setMatches(matchesRes.data || []);
    setLoading(false);
  };

  const table = useMemo(() => {
    const standings = {};
    teams.forEach(t => standings[t.id] = { ...t, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });

    matches.filter(m => m.isCompleted).forEach(m => {
      const home = standings[m.homeTeamId];
      const away = standings[m.awayTeamId];
      if(!home || !away) return;

      home.mp++; away.mp++;
      home.gf += m.homeScore; home.ga += m.awayScore;
      away.gf += m.awayScore; away.ga += m.homeScore;

      if (m.homeScore > m.awayScore) { home.w++; home.pts += 3; away.l++; }
      else if (m.homeScore < m.awayScore) { away.w++; away.pts += 3; home.l++; }
      else { home.d++; away.d++; home.pts += 1; away.pts += 1; }
    });

    return Object.values(standings)
      .map(t => ({ ...t, gd: t.gf - t.ga }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
      .map((t, idx) => ({ ...t, rank: idx + 1 }));
  }, [teams, matches]);

  const stats = useMemo(() => {
    const playerStats = {};
    players.forEach(p => playerStats[p.id] = { ...p, teamName: teams.find(t => t.id === p.teamId)?.name, goals: 0, assists: 0 });

    matches.filter(m => m.isCompleted).forEach(m => {
      (m.events || []).forEach(e => {
        if (playerStats[e.playerId]) {
          if (e.type === 'goal') playerStats[e.playerId].goals++;
          if (e.type === 'assist') playerStats[e.playerId].assists++;
        }
      });
    });

    const topScorers = Object.values(playerStats).filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals);
    const topAssists = Object.values(playerStats).filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists);

    return { topScorers, topAssists };
  }, [players, teams, matches]);

  // LIVE DB UPDATE FUNCTION
  const updateMatch = async (matchId, updatedData, newPlayers = []) => {
    // Instantly add newly typed players to the state so they appear in stats immediately
    if (newPlayers.length > 0) {
      setPlayers(prev => [...prev, ...newPlayers]);
    }

    setMatches(prev => {
      const updated = prev.map(m => m.id === matchId ? { ...m, ...updatedData } : m);
      return updated.sort((a, b) => {
        if (!a.matchDate) return 1;
        if (!b.matchDate) return -1;
        return new Date(a.matchDate) - new Date(b.matchDate);
      });
    });
    
    const { error } = await supabase.from('matches').update(updatedData).eq('id', matchId);
    if (error) alert("Error saving match to database: " + error.message);
  };

  const getTeam = (id) => teams.find(t => t.id === id) || { name: 'Unknown', short: 'UNK' };

  return (
    <LeagueContext.Provider value={{ teams, players, matches, table, stats, updateMatch, getTeam, loading }}>
      {children}
    </LeagueContext.Provider>
  );
};

// ==========================================
// UI COMPONENTS
// ==========================================

const Header = ({ currentView, setCurrentView, user }) => (
  <header className="bg-white border-b border-green-100 sticky top-0 z-10 shadow-sm">
    <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="bg-green-600 text-white p-2 rounded-lg">
          <Goal size={24} />
        </div>
        <h1 className="text-xl font-bold text-green-900 hidden sm:block">ASES HOD Cup</h1>
      </div>
      
      {user && (
        <nav className="flex bg-green-50 rounded-lg p-1">
          <button 
            onClick={() => setCurrentView('public')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${currentView === 'public' ? 'bg-white text-green-700 shadow-sm' : 'text-green-600 hover:text-green-800'}`}
          >
            Public
          </button>
          <button 
            onClick={() => setCurrentView('admin')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${currentView === 'admin' ? 'bg-white text-green-700 shadow-sm' : 'text-green-600 hover:text-green-800'}`}
          >
            <ShieldCheck size={16} /> Admin
          </button>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-800 rounded-md transition-colors ml-2"
          >
            Logout
          </button>
        </nav>
      )}
    </div>
  </header>
);

// --- PUBLIC DASHBOARD VIEWS ---

const LeagueTableView = () => {
  const { table } = useContext(LeagueContext);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-green-50 text-green-800 text-xs uppercase tracking-wider">
              <th className="p-4 font-semibold w-16">Rank</th>
              <th className="p-4 font-semibold">Level</th>
              <th className="p-4 font-semibold text-center">MP</th>
              <th className="p-4 font-semibold text-center hidden sm:table-cell">GF</th>
              <th className="p-4 font-semibold text-center hidden sm:table-cell">GA</th>
              <th className="p-4 font-semibold text-center">GD</th>
              <th className="p-4 font-semibold text-center text-green-700">Pts</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {table.map((team) => (
              <tr 
                key={team.id} 
                // Changed from team.rank === 1 to team.rank <= 2
                className={`border-t border-green-50 hover:bg-green-50/50 transition-colors ${team.rank <= 2 ? 'bg-green-50/80 font-medium' : ''}`}
              >
                <td className="p-4">
                  {/* Changed from team.rank === 1 to team.rank <= 2 */}
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full ${team.rank <= 2 ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500'}`}>
                    {team.rank}
                  </span>
                </td>
                <td className="p-4 font-medium text-gray-800">{team.name}</td>
                <td className="p-4 text-center text-gray-600">{team.mp}</td>
                <td className="p-4 text-center text-gray-500 hidden sm:table-cell">{team.gf}</td>
                <td className="p-4 text-center text-gray-500 hidden sm:table-cell">{team.ga}</td>
                <td className="p-4 text-center text-gray-600">{team.gd > 0 ? `+${team.gd}` : team.gd}</td>
                <td className="p-4 text-center font-bold text-green-700">{team.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const FixturesView = () => {
  const { matches, getTeam } = useContext(LeagueContext);
  
  const formatDate = (dateString) => {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {matches.map((m) => {
        const homeTeam = getTeam(m.homeTeamId);
        const awayTeam = getTeam(m.awayTeamId);
        
        return (
          <div key={m.id} className="bg-white p-5 rounded-xl border border-green-100 shadow-sm flex flex-col">
            <div className="text-center text-xs font-bold text-green-700 bg-green-50 rounded-full w-max mx-auto px-3 py-1 mb-4 border border-green-100">
              {formatDate(m.matchDate)}
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex-1 text-right pr-4 font-medium text-gray-800">{homeTeam.name}</div>
              
              <div className="flex flex-col items-center justify-center px-4">
                {m.isCompleted ? (
                  <div className="bg-green-100 text-green-800 font-bold px-3 py-1 rounded text-lg min-w-[60px] text-center">
                    {m.homeScore} - {m.awayScore}
                  </div>
                ) : (
                  <div className="bg-gray-100 text-gray-500 font-semibold px-3 py-1 rounded text-sm mb-1">
                    VS
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  {m.isCompleted ? <CheckCircle size={12} className="text-green-500"/> : <Clock size={12}/>}
                  {m.isCompleted ? 'FT' : 'Upcoming'}
                </div>
              </div>
              
              <div className="flex-1 pl-4 font-medium text-gray-800">{awayTeam.name}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const StatsView = () => {
  const { stats } = useContext(LeagueContext);
  
  const StatCard = ({ title, data, valueKey }) => (
    <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
      <div className="bg-green-50 p-4 border-b border-green-100 font-semibold text-green-800">{title}</div>
      <div className="p-0">
        {data.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No data available yet</div>
        ) : (
          <ul className="divide-y divide-green-50">
            {data.map((player, idx) => (
              <li key={player.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 w-4 text-center text-sm">{idx + 1}</span>
                  <div>
                    <div className="font-medium text-gray-800">{player.name}</div>
                    <div className="text-xs text-gray-500">{player.teamName}</div>
                  </div>
                </div>
                <div className="font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full">{player[valueKey]}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <StatCard title="Top Scorers" data={stats.topScorers} valueKey="goals" />
      <StatCard title="Top Assists" data={stats.topAssists} valueKey="assists" />
    </div>
  );
};

const PublicDashboard = () => {
  const [activeTab, setActiveTab] = useState('table');
  const { loading } = useContext(LeagueContext);
  
  if (loading) return <div className="text-center py-20 text-green-600 font-semibold">Loading Live Data...</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 pb-4">
        {[
          { id: 'table', label: 'League Table', icon: Trophy },
          { id: 'fixtures', label: 'Fixtures & Results', icon: Calendar },
          { id: 'stats', label: 'Stats Board', icon: BarChart3 }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-green-50 hover:text-green-700 border border-transparent'}`}>
            <tab.icon size={16} />{tab.label}
          </button>
        ))}
      </div>
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'table' && <LeagueTableView />}
        {activeTab === 'fixtures' && <FixturesView />}
        {activeTab === 'stats' && <StatsView />}
      </div>
    </div>
  );
};

// --- ADMIN PANEL VIEWS ---

const MatchEditorForm = ({ match, onClose }) => {
  const { getTeam, players, updateMatch } = useContext(LeagueContext);
  
  const [homeScore, setHomeScore] = useState(match.homeScore || 0);
  const [awayScore, setAwayScore] = useState(match.awayScore || 0);
  const [isCompleted, setIsCompleted] = useState(match.isCompleted);
  const [matchDate, setMatchDate] = useState(match.matchDate || '');
  
  const homeTeam = getTeam(match.homeTeamId);
  const awayTeam = getTeam(match.awayTeamId);

  // Initialize events by converting the raw DB player IDs back into names for the text inputs
  const [events, setEvents] = useState(() => {
    return (match.events || []).map(evt => {
      const p = players.find(player => player.id === evt.playerId);
      return {
        ...evt,
        playerName: p ? p.name : '',
        teamId: p ? p.teamId : match.homeTeamId
      };
    });
  });
  
  const handleAddEvent = () => {
    setEvents([...events, { 
      id: `evt-${Date.now()}`, 
      type: 'goal', 
      playerName: '', 
      teamId: match.homeTeamId, 
      minute: 1 
    }]);
  };
  
  const updateEvent = (eventId, field, value) => setEvents(events.map(e => e.id === eventId ? { ...e, [field]: value } : e));
  const removeEvent = (eventId) => setEvents(events.filter(e => e.id !== eventId));

  const handleSave = async () => {
    const newPlayersToCreate = [];
    const eventsToSave = [];

    // Loop through typed events and check if the player already exists
    for (const evt of events) {
      if (!evt.playerName || evt.playerName.trim() === '') continue; // skip blanks
      const cleanedName = evt.playerName.trim();
      
      // Look for a player with this name (ignoring uppercase/lowercase) on this team
      let existingPlayer = players.find(p => p.name.toLowerCase() === cleanedName.toLowerCase() && p.teamId === evt.teamId);
      let finalPlayerId;

      if (existingPlayer) {
        finalPlayerId = existingPlayer.id; // Found them!
      } else {
        // Did we just create them in this same save click?
        let newlyCreated = newPlayersToCreate.find(p => p.name.toLowerCase() === cleanedName.toLowerCase() && p.teamId === evt.teamId);
        if (newlyCreated) {
          finalPlayerId = newlyCreated.id;
        } else {
          // Genuinely new player -> Prep them for database insert
          const newId = `p-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const newPlayer = { id: newId, name: cleanedName, teamId: evt.teamId };
          newPlayersToCreate.push(newPlayer);
          finalPlayerId = newId;
        }
      }

      // Add to the final payload stripped of the temporary UI text
      eventsToSave.push({
        id: evt.id,
        type: evt.type,
        playerId: finalPlayerId,
        minute: parseInt(evt.minute) || 1
      });
    }

    // Insert completely new players into Supabase before saving the match
    if (newPlayersToCreate.length > 0) {
      const { error } = await supabase.from('players').insert(newPlayersToCreate);
      if (error) {
        alert("Error creating new players: " + error.message);
        return;
      }
    }

    // Save the match details using the real player IDs
    updateMatch(match.id, {
      homeScore: parseInt(homeScore) || 0,
      awayScore: parseInt(awayScore) || 0,
      isCompleted,
      matchDate: matchDate || null,
      events: eventsToSave
    }, newPlayersToCreate);
    
    onClose();
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-green-200 overflow-hidden">
      <div className="bg-green-700 p-4 text-white flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2"><Edit3 size={18}/> Edit Match Details</h3>
        <button onClick={onClose} className="text-green-200 hover:text-white transition-colors text-sm">Cancel</button>
      </div>
      
      <div className="p-6">
        <div className="mb-6 flex flex-col">
          <label className="font-semibold text-gray-800 mb-2">Match Date</label>
          <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none w-full sm:w-1/2" />
        </div>

        <div className="flex items-center justify-between bg-slate-50 p-6 rounded-xl mb-6 border border-slate-200">
          <div className="text-center flex-1">
            <div className="font-bold text-gray-800 mb-2">{homeTeam.name}</div>
            <input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} className="w-20 text-center text-3xl font-bold p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none" />
          </div>
          <div className="text-gray-400 font-bold px-4">VS</div>
          <div className="text-center flex-1">
            <div className="font-bold text-gray-800 mb-2">{awayTeam.name}</div>
            <input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} className="w-20 text-center text-3xl font-bold p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none" />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-8 p-4 bg-green-50 rounded-lg border border-green-100">
          <input type="checkbox" id="completed" checked={isCompleted} onChange={(e) => setIsCompleted(e.target.checked)} className="w-5 h-5 text-green-600 rounded focus:ring-green-500" />
          <label htmlFor="completed" className="font-medium text-green-900 cursor-pointer flex-1">Mark Match as Completed</label>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-800">Match Events</h4>
            <button onClick={handleAddEvent} className="flex items-center gap-1 text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-md hover:bg-green-200 transition-colors"><Plus size={16} /> Add Event</button>
          </div>
          <div className="space-y-3">
            {events.length === 0 && <div className="text-sm text-gray-500 text-center py-4 border border-dashed rounded-lg">No events recorded.</div>}
            
            {events.map((evt) => (
              <div key={evt.id} className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 p-3 rounded-lg shadow-sm">
                
                <select value={evt.type} onChange={(e) => updateEvent(evt.id, 'type', e.target.value)} className="p-2 border rounded-md text-sm bg-gray-50 outline-none">
                  <option value="goal">Goal</option>
                  <option value="assist">Assist</option>
                </select>
                
                {/* Team Selection */}
                <select value={evt.teamId} onChange={(e) => updateEvent(evt.id, 'teamId', e.target.value)} className="p-2 border rounded-md text-sm bg-gray-50 outline-none">
                  <option value={homeTeam.id}>{homeTeam.short}</option>
                  <option value={awayTeam.id}>{awayTeam.short}</option>
                </select>
                
                {/* Free Text Input for Player Name */}
                <input 
                  type="text" 
                  value={evt.playerName} 
                  onChange={(e) => updateEvent(evt.id, 'playerName', e.target.value)} 
                  placeholder="Player Name"
                  className="p-2 border rounded-md text-sm flex-1 min-w-[120px] focus:ring-2 focus:ring-green-500 outline-none"
                />
                
                <div className="flex items-center gap-1">
                  <input type="number" min="1" max="120" value={evt.minute} onChange={(e) => updateEvent(evt.id, 'minute', e.target.value)} className="w-16 p-2 border rounded-md text-sm text-center focus:ring-2 focus:ring-green-500 outline-none" placeholder="Min" />'
                </div>
                
                <button onClick={() => removeEvent(evt.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-md transition-colors ml-auto"><Trash2 size={16} /></button>
              </div>
            ))}

          </div>
        </div>

        <button onClick={handleSave} className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl hover:bg-green-700 transition-colors shadow-md flex justify-center items-center gap-2">
          <CheckCircle size={20} /> Save Match Details
        </button>
      </div>
    </div>
  );
};

const AdminPanel = () => {
  const { matches, getTeam, loading } = useContext(LeagueContext);
  const [editingMatchId, setEditingMatchId] = useState(null);

  if (loading) return <div className="text-center py-20 text-green-600 font-semibold">Loading Live Data...</div>;

  if (editingMatchId) {
    const matchToEdit = matches.find(m => m.id === editingMatchId);
    return (
      <div className="max-w-3xl mx-auto p-4 py-8 animate-in fade-in zoom-in-95 duration-200">
        <button onClick={() => setEditingMatchId(null)} className="text-green-600 mb-4 flex items-center gap-1 hover:underline text-sm font-medium">← Back to Match List</button>
        <MatchEditorForm match={matchToEdit} onClose={() => setEditingMatchId(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 py-8 animate-in fade-in duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Admin Panel</h2>
        <p className="text-gray-500 text-sm mt-1">Select a fixture to update dates, scores, and events.</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-slate-50 border-b border-gray-200 p-4 text-xs uppercase font-semibold text-gray-500 tracking-wider">All Fixtures</div>
        <ul className="divide-y divide-gray-100">
          {matches.map(m => {
            const home = getTeam(m.homeTeamId);
            const away = getTeam(m.awayTeamId);
            return (
              <li key={m.id} className="p-4 hover:bg-green-50/30 transition-colors flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 flex justify-end items-center gap-3 w-full font-medium text-gray-800">{home.name}</div>
                <div className="bg-slate-100 px-4 py-2 rounded-lg font-mono font-bold text-gray-700 min-w-[80px] text-center border border-slate-200">
                  {m.isCompleted ? `${m.homeScore} - ${m.awayScore}` : ' v '}
                </div>
                <div className="flex-1 flex justify-start items-center gap-3 w-full font-medium text-gray-800">{away.name}</div>
                <div className="w-full sm:w-auto flex justify-end mt-2 sm:mt-0">
                  <button onClick={() => setEditingMatchId(m.id)} className="flex items-center gap-1 bg-white border border-green-600 text-green-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors w-full sm:w-auto justify-center">
                    Edit <ChevronRight size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [currentView, setCurrentView] = useState(window.location.hash === '#admin' ? 'admin' : 'public');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') setCurrentView('admin');
      else setCurrentView('public');
    };
    window.addEventListener('hashchange', handleHashChange);

    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <LeagueProvider>
      <div className="min-h-screen bg-slate-50 font-sans">
        <Header currentView={currentView} setCurrentView={setCurrentView} user={user} />
        <main>
          {currentView === 'public' ? (
            <PublicDashboard />
          ) : user ? (
            <AdminPanel />
          ) : (
            <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-4">Admin Login</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <input type="email" value={email} placeholder="Email" className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 outline-none" onChange={(e) => setEmail(e.target.value)} />
                <input type="password" value={password} placeholder="Password" className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 outline-none" onChange={(e) => setPassword(e.target.value)} />
                <button disabled={loading} className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700 transition-colors">{loading ? 'Logging in...' : 'Login'}</button>
              </form>
            </div>
          )}
        </main>
        {/* Developer Signature */}
<div className="w-full py-6 mt-8 text-center">
  <p className="text-xs text-gray-500 opacity-60 hover:opacity-100 transition-opacity duration-300">
    © 2026 Kelly Solutions
  </p>
</div>
<Analytics />
      </div>
    </LeagueProvider>
  );
}