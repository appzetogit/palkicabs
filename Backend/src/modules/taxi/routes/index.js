import { Router } from 'express';
import { chatModuleRouter } from '../chat/routes/index.js';
import { adminModuleRouter } from '../admin/routes/index.js';
import { driverModuleRouter } from '../driver/routes/index.js';
import { supportModuleRouter } from '../support/routes/index.js';
import { userModuleRouter } from '../user/routes/index.js';
import { commonRouter } from '../common/routes/commonRoutes.js';
import { careerRouter } from '../career/routes/careerRoutes.js';
import { busModuleRouter } from '../bus/routes/index.js';
import { eventRouter } from '../event/routes/index.js';

export const taxiRouter = Router();

taxiRouter.use(chatModuleRouter);
taxiRouter.use(adminModuleRouter);
taxiRouter.use(userModuleRouter);
taxiRouter.use(driverModuleRouter);
taxiRouter.use(supportModuleRouter);
taxiRouter.use(commonRouter);
// HIDDEN (careers): taxiRouter.use(careerRouter);
// HIDDEN (bus): taxiRouter.use(busModuleRouter);
taxiRouter.use(eventRouter);
