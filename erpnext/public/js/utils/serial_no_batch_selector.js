erpnext.SerialBatchPackageSelector = class SerialNoBatchBundleUpdate {
	constructor(frm, item, callback) {
		this.frm = frm;
		this.item = item;
		this.qty = item.qty;
		this.callback = callback;
		this.bundle = this.item?.is_rejected
			? this.item.rejected_serial_and_batch_bundle
			: this.item.serial_and_batch_bundle;

		this.make();
		this.render_data();
	}

	make() {
		let that = this;
		let label = this.item?.has_serial_no
			? __("Serial Nos")
			: __("Batch Nos");
		let primary_label = this.bundle ? __("Update") : __("Add");

		if (this.item?.has_serial_no && this.item?.batch_no) {
			label = __("Serial Nos / Batch Nos");
		}

		primary_label += " " + label;

		this.dialog = new frappe.ui.Dialog({
			title: this.item?.title || primary_label,
			fields: this.get_dialog_fields(),
			primary_action_label: primary_label,
			primary_action: () => this.update_bundle_entries(),
			secondary_action_label: __("Edit Full Form"),
			secondary_action: () => this.edit_full_form(),
		});

		this.dialog.set_value("qty", this.item.qty).then(() => {
			if (this.item.serial_no) {
				this.dialog.set_value("scan_serial_no", this.item.serial_no);
				frappe.model.set_value(this.item.doctype, this.item.name, 'serial_no', '');
			} else if (this.item.batch_no) {
				this.dialog.set_value("scan_batch_no", this.item.batch_no);
				frappe.model.set_value(this.item.doctype, this.item.name, 'batch_no', '');
			}
		});

		this.dialog.show();
		// wait dialog to open then do calculation
		setTimeout(() => {
			that.update_total_qty();
			that.update_total_roll();

			document.querySelector('.modal-dialog').classList.add('modal-lg');

			// cur_dialog.wrapper[0].querySelector('[data-action=delete_rows]')
			$(cur_dialog.wrapper).find('[data-action=delete_rows]').on('click', () => {
				that.update_total_qty();
				that.update_total_roll();
			})

		}, 1000);

		this.$scan_btn = this.dialog.$wrapper.find(".link-btn");
		this.$scan_btn.css("display", "inline");
	}

	get_serial_no_filters() {
		let warehouse =
			this.item?.type_of_transaction === "Outward"
				? this.item.warehouse || this.item.s_warehouse
				: "";

		return {
			item_code: this.item.item_code,
			warehouse: ["=", warehouse],
		};
	}

	get_dialog_fields() {
		let fields = [];

		fields.push({
			fieldtype: "Link",
			fieldname: "warehouse",
			label: __("Warehouse"),
			options: "Warehouse",
			default: this.get_warehouse(),
			onchange: () => {
				this.item.warehouse = this.dialog.get_value("warehouse");
				this.get_auto_data();
			},
			get_query: () => {
				return {
					filters: {
						is_group: 0,
						company: this.frm.doc.company,
					},
				};
			},
		});

		// UOM2
		fields.push({
			fieldtype: "Link",
			fieldname: "custom_uom2",
			label: __("UOM2"),
			options: "UOM",
			default: "Roll",
		});

		if (
			this.frm.doc.doctype === "Stock Entry" &&
			this.frm.doc.purpose === "Manufacture"
		) {
			fields.push({
				fieldtype: "Column Break",
			});

			fields.push({
				fieldtype: "Link",
				fieldname: "work_order",
				label: __("For Work Order"),
				options: "Work Order",
				read_only: 1,
				default: this.frm.doc.work_order,
			});

			fields.push({
				fieldtype: "Section Break",
			});
		}

		fields.push({
			fieldtype: "Column Break",
		});

		if (this.item.has_serial_no) {
			fields.push({
				fieldtype: 'Data',
				options: 'Barcode',
				fieldname: 'scan_serial_no',
				label: __('Scan Serial No'),
				get_query: () => {
					return {
						filters: this.get_serial_no_filters(),
					};
				},
				onchange: () => this.update_serial_batch_no(),
			});
		}

		if (this.item.has_batch_no && this.item.has_serial_no) {
			fields.push({
				fieldtype: "Column Break",
			});
		}

		/* if (this.item.has_batch_no) {
			fields.push({
				fieldtype: 'Data',
				options: 'Barcode',
				fieldname: 'scan_batch_no',
				label: __('Scan Batch No'),
				onchange: () => this.update_serial_batch_no()
			});
		} */

		if (this.item?.type_of_transaction === "Outward") {
			fields = [...this.get_filter_fields(), ...fields];
		} else {
			fields = [...fields]; //...this.get_attach_field()
		}

		fields.push({
			fieldtype: "Section Break",
		});

		fields.push({
			fieldname: "entries",
			fieldtype: "Table",
			allow_bulk_edit: true,
			data: [],
			fields: this.get_dialog_table_fields(),
		});

		fields.push({
			fieldtype: "Section Break",
		});

		fields.push({
			fieldtype: "Float",
			fieldname: "custom_total_qty2",
			label: __("Total Roll"),
		});

		fields.push({
			fieldtype: "Column Break",
		});

		fields.push({
			fieldtype: "Float",
			fieldname: "total_qty",
			label: __("Total Qty"),
		});

		return fields;
	}

	/* get_attach_field() {
		let label = this.item?.has_serial_no
			? __("Serial Nos")
			: __("Batch Nos");
		let primary_label = this.bundle ? __("Update") : __("Add");

		if (this.item?.has_serial_no && this.item?.has_batch_no) {
			label = __("Serial Nos / Batch Nos");
		}

		return [
			{
				fieldtype: "Section Break",
				label: __("{0} {1} via CSV File", [primary_label, label]),
			},
			{
				fieldtype: "Button",
				fieldname: "download_csv",
				label: __("Download CSV Template"),
				click: () => this.download_csv_file(),
			},
			{
				fieldtype: "Column Break",
			},
			{
				fieldtype: "Attach",
				fieldname: "attach_serial_batch_csv",
				label: __("Attach CSV File"),
				onchange: () => this.upload_csv_file(),
			},
		];
	} */

	download_csv_file() {
		let csvFileData = ["Serial No"];

		if (this.item.has_serial_no && this.item.has_batch_no) {
			csvFileData = ["Serial No", "Batch No", "Quantity"];
		} else if (this.item.has_batch_no) {
			csvFileData = ["Batch No", "Quantity"];
		}

		const method = `/api/method/erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle.download_blank_csv_template?content=${encodeURIComponent(
			JSON.stringify(csvFileData)
		)}`;
		const w = window.open(frappe.urllib.get_full_url(method));
		if (!w) {
			frappe.msgprint(__("Please enable pop-ups"));
		}
	}

	upload_csv_file() {
		const file_path = this.dialog.get_value("attach_serial_batch_csv");

		frappe.call({
			method: "erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle.upload_csv_file",
			args: {
				item_code: this.item.item_code,
				file_path: file_path,
			},
			callback: (r) => {
				if (r.message.serial_nos && r.message.serial_nos.length) {
					this.set_data(r.message.serial_nos);
				} else if (r.message.batch_nos && r.message.batch_nos.length) {
					this.set_data(r.message.batch_nos);
				}
			},
		});
	}

	get_filter_fields() {
		return [
			{
				fieldtype: "Section Break",
				label: __("Auto Fetch"),
			},
			{
				fieldtype: "Float",
				fieldname: "qty",
				label: __("Qty to Fetch"),
				onchange: () => this.get_auto_data(),
			},
			{
				fieldtype: "Column Break",
			},
			{
				fieldtype: "Select",
				options: ["FIFO", "LIFO", "Expiry"],
				default: "FIFO",
				fieldname: "based_on",
				label: __("Fetch Based On"),
				onchange: () => this.get_auto_data(),
			},
			{
				fieldtype: "Section Break",
			},
		];
	}

	get_dialog_table_fields() {
		let fields = [];

		if (this.item.has_serial_no) {
			fields.push({
				fieldtype: "Link",
				options: "Serial No",
				fieldname: "serial_no",
				label: __("Serial No"),
				in_list_view: 1,
				get_query: () => {
					return {
						filters: this.get_serial_no_filters(),
					};
				},
			});
		}

		let batch_fields = [];
		let self = this;
		if (this.item.has_batch_no) {
			batch_fields = [
				{
					fieldtype: "Link",
					options: "Batch",
					fieldname: "batch_no",
					label: __("Batch No"),
					in_list_view: 1,
					get_query: () => {
						if (this.item.type_of_transaction !== "Outward") {
							return {
								filters: {
									item: this.item.item_code,
								},
							};
						} else {
							return {
								query: "erpnext.controllers.queries.get_batch_no",
								filters: {
									item_code: this.item.item_code,
									warehouse: this.get_warehouse(),
								},
							};
						}
					},
					onchange: function (e) {
						const grid_row = $(".data-row.editable-row")
							.parent()
							.attr("data-name");
						const grid = cur_dialog.get_field("entries").grid;

						const row = grid.get_row(grid_row);
						const fields = row.on_grid_fields_dict;
						const item_code = row.doc.batch_no;

						// wait for dialog to open then patch data
						setTimeout(() => {
							if (cur_dialog.title === "New Batch") {
								const batch_id =
									cur_dialog.get_field("batch_id").value || 0;
								cur_dialog
									.get_field("multiplier")
									.set_value(batch_id);
								cur_dialog
									.get_field("item")
									.set_value(self.item.item_code);

								$(cur_dialog.standard_actions).on(
									"click",
									() => {
										let new_batch = cur_dialog.doc;
										frappe.db.get_doc('Item', self.item.item_code).then((data) => {
											new_batch = {
												...new_batch,
												batch_no: [
													data.custom_item_id,
													new_batch.batch_id,
												].join("-"),
											};

										})

										cur_dialog.hide();
										// wait dialog to hide
										setTimeout(() => {
											fields.batch_no.set_value(
												new_batch.batch_no
											);
										}, 500);

									}
								);
							}
						}, 500);

						if (item_code) {
							self.fetch_batch_no(item_code, function (response) {
								const { multiplier, batch_qty } = response.message;
								fields.custom_multiplier.set_value(multiplier);
								fields.batch_qty.set_value(batch_qty);
							});
						}
					},
				},
			];

			if (!this.item.has_serial_no) {
				let that = this;
				batch_fields.push({
					fieldtype: "Float",
					fieldname: "custom_qty2",
					label: __("Roll"),
					in_list_view: 1,
					onchange: function (e) {
						const gridRow = e.target.closest(".grid-row");
						const rowIndex = gridRow.getAttribute("data-idx") - 1;
						const grid = cur_dialog.fields_dict.entries.grid;
						const row = grid.get_grid_row(rowIndex);

						const field_value = (field) => row.get_field(field).get_value();

						const custom_qty2 = field_value("custom_qty2");
						const multiplier = field_value("custom_multiplier");
						row.get_field("qty").set_value(
							custom_qty2 * multiplier
						);
						that.update_total_roll();
						that.update_total_qty();
					},
				});

				batch_fields.push({
					fieldtype: "Float",
					fieldname: "custom_multiplier",
					label: __("Multiplier"),
					in_list_view: 1,
					read_only: true,
				});

				batch_fields.push({
					fieldtype: "Float",
					fieldname: "qty",
					label: __("Quantity"),
					in_list_view: 1,
					onchange: this.update_total_qty,
				});

				batch_fields.push({
					fieldtype: "Float",
					fieldname: "batch_qty",
					label: __("Stock"),
					in_list_view: 1,
					read_only: true,
				});
			}
		}

		fields = [...fields, ...batch_fields];

		fields.push({
			fieldtype: "Data",
			fieldname: "name",
			label: __("Name"),
			hidden: 1,
		});

		return fields;
	}

	get_auto_data() {
		if (this.item.serial_and_batch_bundle || this.item.rejected_serial_and_batch_bundle) {
			return;
		}

		if (this.item.serial_no || this.item.batch_no) {
			return;
		}

		let { qty, based_on } = this.dialog.get_values();

		// if (!based_on) {
		// 	based_on = "FIFO";
		// }

		// if (qty) {
		// 	frappe.call({
		// 		method: "erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle.get_auto_data",
		// 		args: {
		// 			item_code: this.item.item_code,
		// 			warehouse: this.item.warehouse || this.item.s_warehouse,
		// 			has_serial_no: this.item.has_serial_no,
		// 			has_batch_no: this.item.has_batch_no,
		// 			qty: qty,
		// 			custom_qty2: custom_qty2,
		// 			custom_uom2: custom_uom2,
		// 			based_on: based_on,
		// 		},
		// 		callback: (r) => {
		// 			if (r.message) {
		// 				this.dialog.fields_dict.entries.df.data = r.message;
		// 				this.dialog.fields_dict.entries.grid.refresh();
		// 			}
		// 		},
		// 	});
		// }
	}

	update_serial_batch_no() {
		const { scan_serial_no, scan_batch_no } = this.dialog.get_values();

		if (scan_serial_no) {
			let existing_row = this.dialog.fields_dict.entries.df.data.filter(d => {
				if (d.serial_no === scan_serial_no) {
					return d
				}
			});

			if (existing_row?.length) {
				frappe.throw(__('Serial No {0} already exists', [scan_serial_no]));
			}

			if (!this.item.has_batch_no) {
				this.dialog.fields_dict.entries.df.data.push({
					serial_no: scan_serial_no
				});

				this.dialog.fields_dict.scan_serial_no.set_value('');
			} else {
				frappe.call({
					method: 'erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle.get_batch_no_from_serial_no',
					args: {
						serial_no: scan_serial_no,
					},
					callback: (r) => {
						if (r.message) {
							this.dialog.fields_dict.entries.df.data.push({
								serial_no: scan_serial_no,
								batch_no: r.message
							});

							this.dialog.fields_dict.scan_serial_no.set_value('');
						}
					}

				})
			}
		} else if (scan_batch_no) {
			let existing_row = this.dialog.fields_dict.entries.df.data.filter(d => {
				if (d.batch_no === scan_batch_no) {
					return d
				}
			});

			if (existing_row?.length) {
				existing_row[0].qty += 1;
			} else {
				this.dialog.fields_dict.entries.df.data.push({
					batch_no: scan_batch_no,
					qty: 1
				});
			}

			this.dialog.fields_dict.scan_batch_no.set_value('');
		}

		this.dialog.fields_dict.entries.grid.refresh();
	}

	update_bundle_entries() {
		let entries = this.dialog.get_values().entries;
		let warehouse = this.dialog.get_value("warehouse");
		let custom_uom2 = this.dialog.get_value("custom_uom2");
		entries = entries.map((entry) => ({ ...entry, custom_uom2 }));

		// special case for batch, allow multiple same batch no input
		// accumulate qty & custom__qty2 into unique object data
		let unique_batch_no = [];
		let unique_entries = [];
		entries.forEach((d) => {
			if (!unique_batch_no.includes(d.batch_no)) {
				unique_entries.push(d);
				unique_batch_no.push(d.batch_no);
			} else {
				const batch = unique_entries.find((ud) => ud.batch_no === d.batch_no);
				batch.custom_qty2 += d.custom_qty2;
				batch.qty += d.qty;
			}
		})

		if ((entries && !entries.length) || !entries) {
			frappe.throw(__("Please add atleast one Serial No / Batch No"));
		}

		frappe
			.call({
				method: "erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle.add_serial_batch_ledgers",
				args: {
					entries: unique_entries,
					child_row: this.item,
					doc: this.frm.doc,
					warehouse: warehouse,
				},
			})
			.then((r) => {
				let data = r.message;

				data.custom_uom2 = custom_uom2;
				data.custom_qty2 = entries.reduce(
					(acc, curr) => acc + curr.custom_qty2,
					0
				);

				this.callback && this.callback(data);
				this.frm.save();
				this.dialog.hide();
			});
	}

	edit_full_form() {
		let bundle_id = this.item.serial_and_batch_bundle;
		if (!bundle_id) {
			let _new = frappe.model.get_new_doc(
				"Serial and Batch Bundle",
				null,
				null,
				true
			);

			_new.item_code = this.item.item_code;
			_new.warehouse = this.get_warehouse();
			_new.has_serial_no = this.item.has_serial_no;
			_new.has_batch_no = this.item.has_batch_no;
			_new.type_of_transaction = this.item.type_of_transaction;
			_new.company = this.frm.doc.company;
			_new.voucher_type = this.frm.doc.doctype;
			bundle_id = _new.name;
		}

		frappe.set_route("Form", "Serial and Batch Bundle", bundle_id);
		this.dialog.hide();
	}

	get_warehouse() {
		return this.item?.type_of_transaction === "Outward"
			? this.item.warehouse || this.item.s_warehouse
			: this.item.warehouse || this.item.t_warehouse;
	}

	render_data() {
		if (!this.frm.is_new() && this.bundle) {
			frappe
				.call({
					method: "erpnext.stock.doctype.serial_and_batch_bundle.serial_and_batch_bundle.get_serial_batch_ledgers",
					args: {
						item_code: this.item.item_code,
						name: this.bundle,
						voucher_no: this.item.parent,
					},
				})
				.then((r) => {
					if (r.message) {
						this.set_data(r.message);
					}
				});
		}
	}

	set_data(data) {
		data.forEach((d) => {
			const item = d;
			frappe.db.get_doc('Batch', item.batch_no).then(batch_data => {
				item.batch_qty = batch_data.batch_qty;
				this.dialog.fields_dict.entries.df.data.push(item);
				this.dialog.fields_dict.entries.grid.refresh();
			})
		});
	}

	insert_batch(doc) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.save",
				args: { doc },
				callback: function (r) {
					resolve(r);
				},
			});
		});
	}

	fetch_batch_no(batch_no, callback) {
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Batch",
				name: batch_no,
			},
			callback,
		});
	}

	update_total_roll() {
		setTimeout(() => {
			const grid_row_el = cur_dialog.wrapper[0].querySelectorAll('.grid-row[data-idx]')
			const available_idx = Array.from(grid_row_el, (el) => Number(el.getAttribute('data-idx')));

			const entries = cur_dialog.fields_dict.entries.get_value();
			const total_roll = entries.reduce(
				(acc, cur) => {
					if (available_idx.includes(cur.idx)) {
						return acc + cur.custom_qty2
					} else {
						return 0;
					}
				},
				0
			);
			cur_dialog.fields_dict.custom_total_qty2.set_value(total_roll);
		}, 500)
	}

	update_total_qty() {
		setTimeout(() => {
			const grid_row_el = cur_dialog.wrapper[0].querySelectorAll('.grid-row[data-idx]')
			const available_idx = Array.from(grid_row_el, (el) => Number(el.getAttribute('data-idx')));

			const entries = cur_dialog.fields_dict.entries.get_value();
			const total_qty = entries.reduce((acc, cur) => {
				if (available_idx.includes(cur.idx)) {
					return acc + cur.qty
				} else {
					return 0;
				}
			}, 0);
			cur_dialog.fields_dict.total_qty.set_value(total_qty);
		}, 500);
	}
};
