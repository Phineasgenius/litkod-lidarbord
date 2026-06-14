'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus, 
  RefreshCw, 
  Search, 
  Trophy, 
  TrendingUp, 
  Award, 
  ExternalLink, 
  X, 
  User, 
  AlertTriangle, 
  Check,
  Activity
} from 'lucide-react';
import styles from './page.module.css';

interface DatabaseUser {
  id: string;
  username: string;
  display_name: string;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  total_solved: number;
  contest_rating: number;
  contest_global_ranking: number | null;
  contest_attended_count: number;
  score: number;
  avatar_url: string;
  last_synced_at: string;
}

interface LeaderboardUpdate {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  description: string;
  created_at: string;
}

interface LeaderboardClientProps {
  initialUsers: DatabaseUser[];
  initialUpdates: LeaderboardUpdate[];
}

export default function LeaderboardClient({ initialUsers, initialUpdates }: LeaderboardClientProps) {
  const router = useRouter();
  
  // State
  const [users, setUsers] = useState<DatabaseUser[]>(initialUsers);
  const [updates, setUpdates] = useState<LeaderboardUpdate[]>(initialUpdates);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'total_solved' | 'contest_rating'>('score');
  
  // Add Profile State
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cooldownTime, setCooldownTime] = useState<number>(0);

  // Sync state updates from server props
  useEffect(() => {
    setUsers(initialUsers);
    setUpdates(initialUpdates);
  }, [initialUsers, initialUpdates]);

  // Sync Cooldown countdown
  useEffect(() => {
    if (cooldownTime <= 0) return;
    const timer = setInterval(() => {
      setCooldownTime((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownTime]);

  // Dynamic Relative Time Update
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 15000); // update every 15s for more accuracy
    return () => clearInterval(timer);
  }, []);

  const getRelativeTimeString = (dateString: string) => {
    const time = new Date(dateString).getTime();
    const diffSecs = Math.floor((currentTime - time) / 1000);
    
    if (diffSecs < 10) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(dateString).toLocaleDateString();
  };

  // Handlers
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !secretKey.trim()) return;

    setIsAddingUser(true);
    setAddError(null);
    setAddSuccess(null);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: newUsername,
          displayName: newDisplayName,
          secretKey: secretKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add user');
      }

      setAddSuccess(`Successfully added "${data.user.display_name}"!`);
      setNewUsername('');
      setNewDisplayName('');
      setSecretKey('');
      
      // Refresh page data
      router.refresh();

      // Clear success alert after 4 seconds
      setTimeout(() => {
        setAddSuccess(null);
      }, 4000);
    } catch (err: any) {
      setAddError(err.message || 'An error occurred');
      setTimeout(() => {
        setAddError(null);
      }, 5000);
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleSyncAll = async () => {
    if (isSyncing || cooldownTime > 0) return;

    setIsSyncing(true);
    setSyncError(null);
    setSyncMessage(null);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.status === 429) {
        setCooldownTime(data.retryAfterSeconds || 15);
        throw new Error(data.error || 'Please wait before syncing again');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      setSyncMessage(data.message || 'Sync successful!');
      router.refresh();

      setTimeout(() => {
        setSyncMessage(null);
      }, 3000);
    } catch (err: any) {
      setSyncError(err.message || 'An error occurred during sync');
      setTimeout(() => {
        setSyncError(null);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter & Sort Logic
  const filteredUsers = users.filter((user) => {
    const term = searchQuery.toLowerCase();
    return (
      user.username.toLowerCase().includes(term) ||
      user.display_name.toLowerCase().includes(term)
    );
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (sortBy === 'score') {
      return b.score - a.score;
    }
    if (sortBy === 'total_solved') {
      return b.total_solved - a.total_solved;
    }
    if (sortBy === 'contest_rating') {
      return b.contest_rating - a.contest_rating;
    }
    return 0;
  });

  // Podium Users (Top 3 of ALL sorted users)
  const podiumUsers = sortedUsers.slice(0, 3);
  
  // Arrange top 3 as: 2nd place, 1st place, 3rd place for physical podium aesthetics
  const orderedPodium = [];
  if (podiumUsers[1]) orderedPodium.push({ user: podiumUsers[1], rank: 2 });
  if (podiumUsers[0]) orderedPodium.push({ user: podiumUsers[0], rank: 1 });
  if (podiumUsers[2]) orderedPodium.push({ user: podiumUsers[2], rank: 3 });

  return (
    <div className={styles.wrapper}>
      {/* Header Section */}
      <header className={styles.header}>
        <div className={styles.logoGroup}>
          <div className={styles.logoIcon}>
            <Trophy className={styles.trophyIcon} />
          </div>
          <div>
            <h1 className={styles.title}>LeetCode Leaderboard</h1>
            <p className={styles.subtitle}>Compete, solve, and level up with friends</p>
          </div>
        </div>

        <div className={styles.actionGroup}>
          {syncError && <span className={styles.syncErrorLabel}><AlertTriangle size={14} /> {syncError}</span>}
          {syncMessage && <span className={styles.syncSuccessLabel}><Check size={14} /> {syncMessage}</span>}
          
          <button 
            onClick={handleSyncAll} 
            disabled={isSyncing || cooldownTime > 0} 
            className={`${styles.button} ${styles.buttonSecondary} ${isSyncing ? styles.spinning : ''}`}
            title="Sync all profile data from LeetCode"
          >
            <RefreshCw size={16} className={isSyncing ? styles.spinIcon : ''} />
            {isSyncing ? 'Syncing...' : cooldownTime > 0 ? `Cooldown (${cooldownTime}s)` : 'Sync Profiles'}
          </button>
        </div>
      </header>

      {/* Two-Column Dashboard Layout */}
      <div className={styles.dashboardLayout}>
        {/* Left Column: Leaderboard Data */}
        <div className={styles.mainColumn}>
          {users.length === 0 ? (
            <div className={styles.emptyState}>
              <User className={styles.emptyIcon} />
              <h2>Leaderboard is Empty</h2>
              <p>No profiles are being tracked yet. Add a profile in the sidebar to start!</p>
            </div>
          ) : (
            <>
              {/* Podium Area (Only shown when not searching and sorting by score) */}
              {searchQuery === '' && sortBy === 'score' && sortedUsers.length >= 1 && (
                <section className={styles.podiumSection}>
                  <div className={styles.podiumContainer}>
                    {orderedPodium.map(({ user, rank }) => {
                      const medalClass = 
                        rank === 1 ? styles.goldMedal : 
                        rank === 2 ? styles.silverMedal : 
                        styles.bronzeMedal;
                      
                      return (
                        <div 
                          key={user.id} 
                          className={`${styles.podiumCard} ${medalClass} ${rank === 1 ? styles.podiumCardFirst : ''}`}
                        >
                          <div className={styles.podiumBadge}>
                            {rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}
                          </div>
                          
                          <div className={styles.podiumAvatarContainer}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={user.avatar_url} 
                              alt={user.display_name} 
                              className={styles.podiumAvatar}
                            />
                            <div className={styles.avatarGlow}></div>
                          </div>

                          <div className={styles.podiumUserInfo}>
                            <h3 className={styles.podiumName}>{user.display_name}</h3>
                            <a 
                              href={`https://leetcode.com/${user.username}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className={styles.podiumUsername}
                            >
                              @{user.username} <ExternalLink size={10} />
                            </a>
                          </div>

                          <div className={styles.podiumScoreContainer}>
                            <span className={styles.podiumScoreVal}>{user.score}</span>
                            <span className={styles.podiumScoreLabel}>Points</span>
                          </div>

                          <div className={styles.podiumStats}>
                            <div className={styles.podiumStat}>
                              <span className={styles.statDot} style={{ background: 'var(--lc-easy)' }}></span>
                              <span>{user.easy_solved} E</span>
                            </div>
                            <div className={styles.podiumStat}>
                              <span className={styles.statDot} style={{ background: 'var(--lc-medium)' }}></span>
                              <span>{user.medium_solved} M</span>
                            </div>
                            <div className={styles.podiumStat}>
                              <span className={styles.statDot} style={{ background: 'var(--lc-hard)' }}></span>
                              <span>{user.hard_solved} H</span>
                            </div>
                          </div>

                          {user.contest_rating > 0 && (
                            <div className={styles.podiumRating}>
                              <TrendingUp size={12} style={{ color: 'var(--accent-primary)' }} />
                              <span>Rating: <strong>{user.contest_rating}</strong></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Controls Bar */}
              <div className={styles.controlsBar}>
                <div className={styles.searchBox}>
                  <Search className={styles.searchIcon} size={18} />
                  <input 
                    type="text" 
                    placeholder="Search friend by name or username..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className={styles.clearSearch}>
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className={styles.sortOptions}>
                  <span className={styles.sortLabel}>Sort:</span>
                  <div className={styles.sortButtonGroup}>
                    <button 
                      onClick={() => setSortBy('score')} 
                      className={`${styles.sortButton} ${sortBy === 'score' ? styles.sortButtonActive : ''}`}
                    >
                      <Award size={14} /> Score
                    </button>
                    <button 
                      onClick={() => setSortBy('total_solved')} 
                      className={`${styles.sortButton} ${sortBy === 'total_solved' ? styles.sortButtonActive : ''}`}
                    >
                      <Trophy size={14} /> Solved
                    </button>
                    <button 
                      onClick={() => setSortBy('contest_rating')} 
                      className={`${styles.sortButton} ${sortBy === 'contest_rating' ? styles.sortButtonActive : ''}`}
                    >
                      <TrendingUp size={14} /> Rating
                    </button>
                  </div>
                </div>
              </div>

              {/* Leaderboard Table Card */}
              <div className={styles.tableCard}>
                <div className={styles.tableResponsive}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: '60px', textAlign: 'center' }}>Rank</th>
                        <th>User</th>
                        <th style={{ textAlign: 'center' }}>Score</th>
                        <th style={{ textAlign: 'center' }}>Questions Solved</th>
                        <th style={{ textAlign: 'center' }}>Contest Rating</th>
                        <th style={{ textAlign: 'right' }}>Sync Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((user, idx) => {
                        const originalRank = filteredUsers.findIndex(u => u.id === user.id) + 1;
                        const finalRank = searchQuery ? originalRank : idx + 1;
                        
                        const rankBadgeClass = 
                          finalRank === 1 ? styles.rank1 : 
                          finalRank === 2 ? styles.rank2 : 
                          finalRank === 3 ? styles.rank3 : '';

                        return (
                          <tr key={user.id} className={styles.tableRow}>
                            {/* Rank */}
                            <td className={styles.rankCell}>
                              <span className={`${styles.rankNumber} ${rankBadgeClass}`}>
                                {finalRank}
                              </span>
                            </td>

                            {/* User details */}
                            <td>
                              <div className={styles.userCell}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                  src={user.avatar_url} 
                                  alt={user.display_name} 
                                  className={styles.userAvatarSmall}
                                />
                                <div className={styles.userNameBlock}>
                                  <div className={styles.userDisplayName}>{user.display_name}</div>
                                  <a 
                                    href={`https://leetcode.com/${user.username}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className={styles.userUsername}
                                  >
                                    @{user.username} <ExternalLink size={8} />
                                  </a>
                                </div>
                              </div>
                            </td>

                            {/* Score */}
                            <td style={{ textAlign: 'center' }}>
                              <span className={styles.scoreHighlight}>
                                {user.score}
                              </span>
                            </td>

                            {/* Solved pills */}
                            <td>
                              <div className={styles.solvedPillsContainer}>
                                <span className={`${styles.solvedPill} ${styles.easyPill}`}>
                                  {user.easy_solved} E
                                </span>
                                <span className={`${styles.solvedPill} ${styles.mediumPill}`}>
                                  {user.medium_solved} M
                                </span>
                                <span className={`${styles.solvedPill} ${styles.hardPill}`}>
                                  {user.hard_solved} H
                                </span>
                                <span className={`${styles.solvedPill} ${styles.totalPill}`} title="Total Solved">
                                  {user.total_solved} Total
                                </span>
                              </div>
                            </td>

                            {/* Contest Rating */}
                            <td style={{ textAlign: 'center' }}>
                              {user.contest_rating > 0 ? (
                                <div className={styles.ratingTableVal}>
                                  <span className={styles.ratingNum}>{user.contest_rating}</span>
                                  {user.contest_global_ranking && (
                                    <span className={styles.ratingRank}>Rank: #{user.contest_global_ranking.toLocaleString()}</span>
                                  )}
                                </div>
                              ) : (
                                <span className={styles.textMuted}>—</span>
                              )}
                            </td>

                            {/* Sync age */}
                            <td style={{ textAlign: 'right' }}>
                              <span className={styles.syncAgeText}>
                                {getRelativeTimeString(user.last_synced_at)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {sortedUsers.length === 0 && (
                  <div className={styles.noResults}>
                    <Search size={28} />
                    <p>No profiles match "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Column: Sidebar (Add Profile inline form & Milestones Activity Feed) */}
        <aside className={styles.sidebar}>
          {/* Add Profile Widget */}
          <div className={styles.sidebarWidget}>
            <h2 className={styles.widgetTitle}>
              <Plus size={18} className={styles.widgetIcon} />
              Add LeetCode Profile
            </h2>
            
            <form onSubmit={handleAddUser} className={styles.inlineForm}>
              {addError && (
                <div className={styles.modalError}>
                  <AlertTriangle size={14} />
                  <span>{addError}</span>
                </div>
              )}
              
              {addSuccess && (
                <div className={styles.modalSuccess}>
                  <Check size={14} />
                  <span>{addSuccess}</span>
                </div>
              )}

              <div className={styles.formGroup}>
                <label htmlFor="leetcode-username">LeetCode Username</label>
                <input 
                  type="text" 
                  id="leetcode-username"
                  placeholder="e.g. tourist"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  disabled={isAddingUser}
                  className={styles.modalInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="display-name">Display Name (Nickname)</label>
                <input 
                  type="text" 
                  id="display-name"
                  placeholder="Optional nickname"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  disabled={isAddingUser}
                  className={styles.modalInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="secret-passkey">Secret Passkey</label>
                <input 
                  type="password" 
                  id="secret-passkey"
                  placeholder="Enter 'imalitkodar'"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  required
                  disabled={isAddingUser}
                  className={styles.modalInput}
                />
              </div>

              <button 
                type="submit" 
                disabled={isAddingUser || !newUsername.trim() || !secretKey.trim()}
                className={`${styles.button} ${styles.buttonPrimary} ${styles.widgetSubmitButton} ${isAddingUser ? styles.buttonLoading : ''}`}
              >
                {isAddingUser ? 'Adding...' : 'Add Profile'}
              </button>
            </form>
          </div>

          {/* Activity / Milestones Updates Widget */}
          <div className={styles.sidebarWidget}>
            <h2 className={styles.widgetTitle}>
              <Activity size={18} className={styles.widgetIcon} />
              Recent Activity
            </h2>
            
            <div className={styles.activityFeed}>
              {updates.length === 0 ? (
                <div className={styles.emptyActivity}>
                  <p>No activity yet. Sync profiles or add new users to generate updates!</p>
                </div>
              ) : (
                <div className={styles.activityList}>
                  {updates.map((update) => (
                    <div key={update.id} className={styles.activityItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={update.avatar_url || 'https://assets.leetcode.com/users/default_avatar.jpg'} 
                        alt={update.display_name} 
                        className={styles.activityAvatar}
                      />
                      <div className={styles.activityBody}>
                        <div className={styles.activityHeaderLine}>
                          <span className={styles.activityUserName}>{update.display_name}</span>
                          <span className={styles.activityTime}>{getRelativeTimeString(update.created_at)}</span>
                        </div>
                        <span className={styles.activityText}>{update.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
