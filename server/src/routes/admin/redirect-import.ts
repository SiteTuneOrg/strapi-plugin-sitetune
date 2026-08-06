export default {
  method: "POST",
  path: "/redirects/import",
  handler: "redirect-import.import",
  config: {
    policies: [
      {
        name: "admin::hasPermissions",
        config: { actions: ["plugin::sitetune.redirect.import"] },
      },
    ],
  },
};
