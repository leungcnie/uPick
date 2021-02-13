/*
 * All routes for Index are defined here
 * Since this file is loaded in server.js into api/users,
 *   these routes are mounted onto /users
 * See: https://expressjs.com/en/guide/using-middleware.html#middleware.router
 */

const express = require('express');
const router = express.Router();

const shuffleArray = function(array) {
  for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
  }
}

const calculatePercentage = function(poll) {
  totalChoices = Object.keys(poll.choicesNRanks).length;
  sumTotalChoices = (totalChoices * (totalChoices + 1)) / 2;
  for (const key in poll.choicesNRanks) {
    let choice = poll.choicesNRanks[key];
    choice.percentage = Math.round(((choice.rank / (sumTotalChoices * choice.totalVotes)) * 100) * 10) /10;
  }
}

// choice.percentage = Math.round(((choice.rankSum / (sumTotalChoices(totalChoices) * totalVotes)) * 100) * 10) / 10;

module.exports = (db) => {
  router.get("/", (req, res) => {
    const queryString = `
    SELECT polls.id, polls.title AS polls, polls.description AS description, choices.name AS choices, SUM(choice_rankings.ranking) AS rank, count(choice_rankings.ranking) as total_rankings
    FROM polls
    LEFT JOIN choices ON poll_id = polls.id
    LEFT JOIN choice_rankings ON choice_id = choices.id
    GROUP BY polls.id, polls.title, choices.name
    HAVING COUNT(choice_rankings.id) > 0
    ORDER BY polls.id, COUNT(choice_rankings.ranking) DESC
    `;

    db.query(queryString)
      .then(data => {
        const index = data.rows;
        let currentPollId = -1; // or whatever you know will never exist
        let currentPollObj = null;
        let polls = [];
        for (const row of index) {
          if (currentPollId != row.id) {
            // insert the previously constructed poll object into the array
            if (currentPollObj !== null) {
              polls.push(currentPollObj);
              calculatePercentage(currentPollObj);
            }
            // we've found a new unique poll id, create a new object to represent this new poll
            currentPollId = row.id;

            currentPollObj = {};
            currentPollObj.question = row.polls;
            currentPollObj.description = row.description;
            currentPollObj.rank = row.rank;
            currentPollObj.choicesNRanks = {};
          }
          currentPollObj.choicesNRanks[row.choices] = { rank: (row.rank === null ? 0 : Number(row.rank)), totalVotes: row.total_rankings, percentage: 0 };
        }
        // insert the last poll object, since that won't be done in the loop
        // note: what if you have no polls in the database?
        if (currentPollObj !== null) {
        polls.push(currentPollObj);
        calculatePercentage(currentPollObj);
        }
        shuffleArray(polls);
        polls = polls.slice(0, 3);
        const templateVars = { polls };
        res.render('index', templateVars);
      })
      .catch(err => {
        res
          .status(500)
          .json({ error: err.message });
      });
  });

  // (STRETCH) pseudo-login for email
  router.get('/login/:id', (req, res) => {
    // Set a cookie called "email"
    req.session.email = req.params.id;
    res.redirect('/polls');
  })

  router.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
  })

  return router;
};
