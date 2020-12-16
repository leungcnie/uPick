uPick - Poll Maker
=========

## Getting Started

1. Create the `.env` by using `.env.example` as a reference: `cp .env.example .env`
2. Install dependencies: `npm i`
3. Reset database: `npm run db:reset`
  - Check the db folder to see what gets created and seeded in the SDB
4. Run the server: `npm run local`
  - Note: nodemon is used, so you should not have to restart your server
5. Visit `http://localhost:8080/`

## Dependencies

- Node 10.x or above
- NPM 5.x or above
- PG 6.x

## Final Product

!["Home Page"](https://github.com/leungcnie/uPick/blob/master/docs/homepage.png?raw=true)
!["Poll Creation Page"](https://github.com/leungcnie/uPick/blob/master/docs/poll-creation.png?raw=true)
!["Poll Results Page"](https://github.com/leungcnie/uPick/blob/master/docs/results-page.png?raw=true)
