/*
 * All routes for Polls are defined here
 * Since this file is loaded in server.js into api/widgets,
 *   these routes are mounted onto /widgets
 * See: https://expressjs.com/en/guide/using-middleware.html#middleware.router
 */

const express = require('express');
const router = express.Router(); //define routes w/o initializing express app like in server.js

module.exports = (db) => { //exporting a FUNCTION that RETURNS a router

  // Render poll creation page
  router.get("/create", (req, res) => {
      res.render('poll_create');
  });

  // Add a new poll to database + redirect to voting page
  router.post("/", (req, res) => {
    const formData = req.body.text;
    const title = formData[0];
    const email = formData[1];
    const description = formData[2];
    const choiceNames = formData.slice(3); // array of choice names
    const pollKey = generateRandomString();

    const pollParams = [
      email,
      title,
      description,
      `http://localhost:8080/polls/${pollKey}/result`,
      `http://localhost:8080/polls/${pollKey}`
    ];

    const queryString = `
    INSERT INTO polls (email, title, description, admin_link, submission_link)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `;

    // Add poll to polls table
    db.query(queryString, pollParams)
      .then(data => {
        return data.rows[0]; // return that poll
      })
      .then(poll => {
        const poll_id = poll.id;
        console.log("poll_id:", poll_id);
        const queryString = `
        INSERT INTO choices (poll_id, name)
        VALUES ($1, $2);
        `;

        // Add each choice to choices table
        for (const name of choiceNames) {
          db.query(queryString, [poll_id, name]);
        }
      })
      .catch(err => {
        res
          .status(500)
          .json({ error: err.message });
      });
    res.redirect(`/polls/${pollKey}`);
  });

  // Render voting + links page
  router.get("/:id", (req, res) => {
    const pollKey = req.params.id;
    console.log("POLLKEY", pollKey);
    const queryString = `
    SELECT polls.*, choices.name
    FROM polls
    JOIN choices ON poll_id = polls.id
    WHERE submission_link LIKE $1;
    `;
    const queryParams = [`%${pollKey}`];
    db.query(queryString, queryParams)
      .then(data => {
        const queryRows = data.rows; // array of objects
        let choices = [];
        for (const row of queryRows) {
          choices.push(row.name);
        }
        const templateVars = {
          title: queryRows[0].title,
          description: queryRows[0].description,
          admin_link: queryRows[0].admin_link,
          submission_link: queryRows[0].submission_link,
          choices
        }
        res.render('poll_voting', templateVars);
      })
      .catch(err => {
        res
          .status(500)
          .json({ error: err.message });
      });
  });

  // Add new choice_rankings for a choices
  router.post("/:id", (req, res) => {
    const choiceRankingsObj = req.body;
    const pollKey = req.params.id;
    const promises = [];

    // For each choice, grab its id
    for (const key in choiceRankingsObj) {
      const queryString = `
      SELECT choices.id FROM choices
      JOIN polls ON polls.id = poll_id
      WHERE name = $1
      AND submission_link LIKE $2;
      `;
      const promise = db.query(queryString, [key, `%${pollKey}`])
      .then(data => {
        const choiceId = data.rows[0].id;
        const queryString = `
        INSERT INTO choice_rankings (choice_id, ranking)
        VALUES ($1, $2);
        `;
        // Insert each new choice_rankings row
        db.query(queryString, [choiceId, choiceRankingsObj[key]]);
      })
      promises.push(promise);
    }

    Promise.all(promises)
      .then(() => {
        res.send("Redirect");
      })
      .catch(err => {
        res
          .status(500)
          .json({ error: err.message });
      });
  });

  // Render poll results page
  router.get("/:id/result", (req, res) => {
    const pollkey = req.params.id;
    const queryString = `
    SELECT polls.title, polls.description, choices.name, sum(choice_rankings.ranking) as sum_rankings, count(choice_rankings.ranking) as total_rankings
    FROM polls
    JOIN choices ON polls.id = poll_id
    JOIN choice_rankings ON choices.id = choice_id
    WHERE polls.admin_link LIKE '%${pollkey}%'
    GROUP BY polls.title, polls.description, choices.name;
    `;
    db.query(queryString)
    .then(data => {
      console.log(data.rows)

      //results from the query
      const queryRows = data.rows;

      //store results into corresponding variables
      const title = queryRows[0].title;
      const description = queryRows[0].description;
      const totalVotes = queryRows[0].total_rankings;
      const totalChoices = queryRows.length;

      //array of choice objects containing choice name, sum of rankings
      const choices = [];
      for (const row of queryRows) {
        choices.push({ name: row.name, rankSum: row.sum_rankings });
      }

      //recursive function to get the sum of total choices
      const sumTotalChoices = (n) => {
        if (n < 1) {
          return 0;
        }
        return n + sumTotalChoices(n - 1);
      }

      //calculate percentage of votes for each choice using borda count method
      for (const choice of choices) {
        choice.percentage = Math.round(((choice.rankSum / (sumTotalChoices(totalChoices) * totalVotes))*100) * 10) / 10;
      }


      console.log('sum', sumTotalChoices(5));
      console.log(choices);
      console.log('votes:', totalVotes, 'totalchoices', totalChoices);

      const templateVars = { title, description, choices };
      res.render('poll_results', templateVars);
    })
    .catch(err => {
      res
          .status(500)
          .json({ error: err.message });
    });

  });

  // HELPER FUNCTIONS

  // Generate random string for unique poll id
  const generateRandomString = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let randomString = "";
    for (let i = 0; i < 6; i++) {
      randomString += chars[Math.floor(Math.random() * chars.length)];
    }
    return randomString;
  };

  return router;
};
