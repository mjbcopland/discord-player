export const commands = [
  {
    name: "play",
    description: "Play",
    options: [
      {
        name: "query",
        type: 3, // STRING
        description: "Query",
        required: true,
      },
    ],
  },
  {
    name: "stop",
    description: "Stop",
  },
  {
    name: "skip",
    description: "Skip",
  },
];
