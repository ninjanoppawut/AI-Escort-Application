# Feature modules

Domain logic lives under one feature folder and remains independent from App
Router page components. Add vertical slices in roadmap order:

- auth, classes, and class invitations;
- notifications;
- groups and group invitations;
- activities, sessions, and live map;
- observations and plant analysis;
- teacher review and completed map;
- admin operations.

Feature modules may depend on shared contracts in `src/lib`. Shared modules must
not import feature or route code. Server-only modules must not enter Client
Component dependency graphs.
