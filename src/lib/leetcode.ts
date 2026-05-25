export interface LeetCodeStats {
  username: string;
  displayName: string;
  avatarUrl: string;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  totalSolved: number;
  contestRating: number;
  contestGlobalRanking: number | null;
  contestAttendedCount: number;
  score: number;
}

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

const USER_STATS_QUERY = `
  query getUserStats($username: String!) {
    matchedUser(username: $username) {
      username
      profile {
        realName
        userAvatar
      }
      submitStats: submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
    userContestRanking(username: $username) {
      attendedContestsCount
      rating
      globalRanking
    }
  }
`;

export async function fetchLeetCodeStats(username: string): Promise<LeetCodeStats> {
  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
      'Referer': `https://leetcode.com/${username}/`,
    },
    body: JSON.stringify({
      query: USER_STATS_QUERY,
      variables: { username },
    }),
    // Keep it fresh, bypass cache during sync calls
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from LeetCode: ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors) {
    throw new Error(`LeetCode GraphQL error: ${json.errors[0]?.message || 'Unknown error'}`);
  }

  const matchedUser = json.data?.matchedUser;
  if (!matchedUser) {
    throw new Error(`LeetCode user "${username}" not found.`);
  }

  // Parse submission stats
  let easySolved = 0;
  let mediumSolved = 0;
  let hardSolved = 0;
  let totalSolved = 0;

  const acSubmissionNum = matchedUser.submitStats?.acSubmissionNum || [];
  for (const item of acSubmissionNum) {
    if (item.difficulty === 'Easy') {
      easySolved = item.count;
    } else if (item.difficulty === 'Medium') {
      mediumSolved = item.count;
    } else if (item.difficulty === 'Hard') {
      hardSolved = item.count;
    } else if (item.difficulty === 'All') {
      totalSolved = item.count;
    }
  }

  // Parse contest stats
  const contestRanking = json.data?.userContestRanking;
  const contestRating = contestRanking?.rating ? Math.round(contestRanking.rating) : 0;
  const contestGlobalRanking = contestRanking?.globalRanking || null;
  const contestAttendedCount = contestRanking?.attendedContestsCount || 0;

  // Calculate score: hard * 5 + med * 3 + easy * 1
  const score = (hardSolved * 5) + (mediumSolved * 3) + (easySolved * 1);

  const displayName = matchedUser.profile?.realName || username;
  const avatarUrl = matchedUser.profile?.userAvatar || 'https://assets.leetcode.com/users/default_avatar.jpg';

  return {
    username: matchedUser.username,
    displayName,
    avatarUrl,
    easySolved,
    mediumSolved,
    hardSolved,
    totalSolved,
    contestRating,
    contestGlobalRanking,
    contestAttendedCount,
    score,
  };
}
