import {
  createAdminService,
  getAdminsService,
  getAdminByIdService,
  updateAdminService,
  updateProfileService
} from "./admin.service.js";

import {
  createAdminSchema,
  updateAdminSchema,
  updateProfileSchema
} from "./admin.validation.js";

export const createAdmin = async (req, res) => {
  try {
    await createAdminSchema.validateAsync(req.body);
    const result = await createAdminService(req.admin, req.body);
    res.json({ success: true, message: "Admin created", data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getAdmins = async (req, res) => {
  const data = await getAdminsService();
  res.json({ success: true, data });
};

export const getAdminById = async (req, res) => {
  const data = await getAdminByIdService(req.params.id);
  res.json({ success: true, data });
};

export const updateAdmin = async (req, res) => {
  try {
    await updateAdminSchema.validateAsync(req.body);
    await updateAdminService(req.admin, req.params.id, req.body);
    res.json({ success: true, message: "Admin updated" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    await updateProfileSchema.validateAsync(req.body);
    await updateProfileService(req.admin, req.body);
    res.json({ success: true, message: "Profile updated" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
