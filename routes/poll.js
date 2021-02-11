/*
 * All routes for Polls are defined here
 * Since this file is loaded in server.js into api/widgets,
 *   these routes are mounted onto /widgets
 * See: https://expressjs.com/en/guide/using-middleware.html#middleware.router
 */

const express = require("express");
const router = express.Router();
const mailgun = require("mailgun-js");
// ------ ADD YOU OWN API KEY AND DOMAIN INTO .env -------------
// load .env data into process.env
require("dotenv").config();
const apiKey = process.env.mailgun_api;
const domain = process.env.mailgun_domain;
// --------------------------------------------------------------
const mg = mailgun({ apiKey, domain });

module.exports = (db) => {
  // Render poll creation page
  router.get("/create", (req, res) => {
    res.render("poll_create");
  });

  // Render a user's polls
  router.get("/", (req, res) => {
    const email = req.session.email;

    // If user hasn't logged in, redirect to error page
    if (!email) {
      res.render("poll_browsing", { loggedIn: false, emailExists: null });
      return;
    }
    // Get poll's id, submission_link, and title
    const queryString = `
    SELECT polls.id, polls.submission_link, polls.title
    FROM polls
    JOIN choices ON poll_id = polls.id
    WHERE polls.email = $1
    GROUP BY polls.id;
    `;
    db.query(queryString, [email])
      .then((data) => {
        const polls = data.rows;
        // If query returns nothing (email doesn't exist), redirect to error page
        if (polls.length === 0) {
          return res.render("poll_browsing", {
            loggedIn: true,
            emailExists: false,
          });
        }

        // Otherwise render a page of user's polls
        console.log("what r the data.rows", data.rows);
        const templateVars = {
          polls,
          email,
          loggedIn: true,
          emailExists: true,
        };
        res.render("poll_browsing", templateVars);
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  // Render searched polls
  router.get("/search", (req, res) => {
    const search = req.query.search;

    const queryString = `
      SELECT polls.id, polls.submission_link, polls.title AS polls, choices.name AS choices, SUM(choice_rankings.ranking) AS rank
      FROM polls
      LEFT JOIN choices ON poll_id = polls.id
      LEFT JOIN choice_rankings ON choice_id = choices.id
      WHERE LOWER(polls.title) LIKE LOWER('%${search}%')
      GROUP BY polls.id, polls.title, choices.name
      ORDER BY polls.id, COUNT(choice_rankings.ranking) DESC;
      `;
    db.query(queryString)
      .then((data) => {
        console.log(data.rows);
        const index = data.rows;
        // console.log(index);
        let currentPollId = -1; // or whatever you know will never exist
        let currentPollObj = null;
        let polls = [];
        let counter = 1;
        for (const row of index) {
          if (currentPollId != row.id) {
            // insert the previously constructed poll object into the array
            if (currentPollObj !== null) {
              polls.push(currentPollObj);
              if (counter > 10) break;
              counter += 1;
            }

            // we've found a new unique poll id, create a new object to represent this new poll
            currentPollId = row.id;

            currentPollObj = {};
            currentPollObj.question = row.polls;
            currentPollObj.choicesNRanks = {};
            currentPollObj.link = row.submission_link.slice(-13);
          }
          currentPollObj.choicesNRanks[row.choices] =
            row.rank === null ? 0 : Number(row.rank);
        }
        // insert the last poll object, since that won't be done in the loop
        // note: what if you have no polls in the database?
        if (currentPollObj !== null) {
          polls.push(currentPollObj);
        }
        const templateVars = { polls };
        console.log(polls);
        res.render("poll_search", templateVars);
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  router.post("/:id/delete", (req, res) => {
    const pollId = req.params.id;
    // Use pollId to delete poll from polls table
    queryString = `
    DELETE FROM polls
    WHERE polls.id = $1;
    `;
    db.query(queryString, [pollId])
      .then(() => {
        // Redirect to user's polls page
        res.redirect("/polls");
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  // Add a new poll to database + redirect to voting page
  router.post("/", (req, res) => {
    const formData = req.body.text;
    console.log("WHATS THE FORM DATA", formData);
    const title = formData[0];
    const email = formData[1];
    const description = formData[2];
    const choiceNames = formData.slice(3).filter((name) => name !== ""); // array of choice names
    const pollKey = generateRandomString();

    const pollParams = [
      email,
      title,
      description,
      `http://localhost:8080/polls/${pollKey}/result`,
      `http://localhost:8080/polls/${pollKey}`,
    ];

    const queryString = `
    INSERT INTO polls (email, title, description, admin_link, submission_link)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `;

    // Add poll to polls table
    db.query(queryString, pollParams)
      .then((data) => {
        return data.rows[0]; // return that poll
      })
      .then((poll) => {
        const poll_id = poll.id;
        let queryString = `
        INSERT INTO choices (poll_id, name)
        VALUES `;
        const queryVals = [];
        const queryParams = [];
        let i = 1;

        for (const name of choiceNames) {
          // Build queryParams
          queryParams.push(poll_id, name);

          // Build queryString
          queryVals.push(`($${i}, $${i + 1})`);
          i += 2;
        }
        queryString += queryVals.join(",") + ";";

        console.log("queryString", queryString);
        console.log("queryParams", queryParams);

        db.query(queryString, queryParams);
        console.log("SECOND DOT THEN!!");
      })
      .then(() => {
        console.log("DO WE MAKE IT HERE");
        // Send links to poll creator
        const emailLinks = {
          from: "uPick <kevinli296@outlook.com>",
          to: email,
          subject: "You just made a poll!",
          html: `
          <h2 style="color: #457b9d">Now you're asking the big questions!</h2>
          You just asked: <i><b>${title}</b></i>. Share and vote (${pollParams[4]}) or take a peek at the results (${pollParams[3]}).
          <br>
          <br>
          Cheers,
          <br>
          The uPick team
          `,
        };
        mg.messages().send(emailLinks, function (error, body) {
          if (error) {
            console.log("Mailgun error:", error);
          }
          console.log(body);
        });

        res.redirect(`/polls/${pollKey}`);
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  });

  // Render voting + links page
  router.get("/:id", (req, res) => {
    const pollKey = req.params.id;
    const queryString = `
    SELECT polls.*, choices.name
    FROM polls
    JOIN choices ON poll_id = polls.id
    WHERE submission_link LIKE $1;
    `;
    const queryParams = [`%${pollKey}`];
    db.query(queryString, queryParams)
      .then((data) => {
        const queryRows = data.rows; // array of row objects
        let choices = [];
        for (const row of queryRows) {
          choices.push(row.name);
        }
        const templateVars = {
          title: queryRows[0].title,
          description: queryRows[0].description,
          admin_link: queryRows[0].admin_link,
          submission_link: queryRows[0].submission_link,
          choices,
          inDatabase: true,
        };
        res.render("poll_voting", templateVars);
      })
      .catch((err) => {
        res.status(404);
        res.render("poll_voting", { inDatabase: false });
      });
  });

  // Add new choice_rankings for a choices
  router.post("/:id", (req, res) => {
    const choiceRankingsObj = req.body;
    const pollKey = req.params.id;
    let email = "";
    let pollTitle = "";
    let adminLink = "";
    const promises = [];

    // For each choice, grab its id
    for (const key in choiceRankingsObj) {
      const queryString = `
      SELECT choices.id, polls.email, polls.title, polls.admin_link FROM choices
      JOIN polls ON polls.id = poll_id
      WHERE name = $1
      AND submission_link LIKE $2;
      `;
      const promise = db
        .query(queryString, [key, `%${pollKey}`])
        .then((data) => {
          const choiceId = data.rows[0].id;
          email = data.rows[0].email;
          pollTitle = data.rows[0].title;
          adminLink = data.rows[0].admin_link;
          const queryString = `
        INSERT INTO choice_rankings (choice_id, ranking)
        VALUES ($1, $2);
        `;
          // Insert each new choice_rankings row
          db.query(queryString, [choiceId, choiceRankingsObj[key]]);
        });
      promises.push(promise);
    }

    console.log(email, pollTitle, adminLink);
    Promise.all(promises)
      .then(() => {
        // Send email to poll creator when vote is received
        const emailVoteNotif = {
          from: "uPick <kevinli296@outlook.com>",
          to: email,
          subject: "Someone just voted on your poll!",
          html: `
          <h2 style="color: #457b9d">Good news! Someone's chipped in.</h2>
          Someone just voted on your poll, <i><b>"${pollTitle}"</b></i>. Why not take a peek at the results? (${adminLink}).<br>
          <br>
          <br>
          Cheers,
          <br>
          The uPick✓ team`,
        };
        mg.messages().send(emailVoteNotif, function (error, body) {
          if (error) {
            console.log("Mailgun error:", error);
          }
          console.log(body);
        });

        // Send to AJAX to redirect
        res.send("Redirect");
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
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
      .then((data) => {
        console.log(data.rows);

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
        };

        //calculate percentage of votes for each choice using borda count method
        for (const choice of choices) {
          choice.percentage =
            Math.round(
              (choice.rankSum / (sumTotalChoices(totalChoices) * totalVotes)) *
                100 *
                10
            ) / 10;
        }

        console.log("sum", sumTotalChoices(5));
        console.log(choices);
        console.log("votes:", totalVotes, "totalchoices", totalChoices);

        const templateVars = {
          title,
          description,
          choices,
          pollkey,
          inDatabase: true,
        };
        res.render("poll_results", templateVars);
      })
      .catch((err) => {
        res.status(404);
        res.render("poll_voting", { inDatabase: false });
      });
  });

  // HELPER FUNCTIONS

  // Generate random string for unique poll id
  const generateRandomString = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let randomString = "";
    for (let i = 0; i < 6; i++) {
      randomString += chars[Math.floor(Math.random() * chars.length)];
    }
    return randomString;
  };

  return router;
};
