const userProfileModule = require('../models/users/userProfile.model');
// const GroupsHelper = require('./group.helper');


const { 
    INPUT_OLD_PASSWORD, 
    INPUT_NEW_PASSWORD, 
    INPUT_EMAIL_OR_PHONE, 
    WRONG_PASSWORD,
    OLD_PASSWORD_EQUALS_NEW,
    PASSWORD_NO_MATCH 
} = require('../errorDefinition/errors.map');

const bcrypt = require('bcrypt-nodejs');
const isEmpty = require('lodash/isEmpty');
const compact = require('lodash/compact');
const uniq = require('lodash/uniq');
class User {
    static async findByCountry(country) {
        return await userProfileModule.UserProfile.find({
            'location.coutry': country
        });
    }

    static async findByPostcode(postcode) {
        return await userProfileModule.UserProfile.find({
            'location.postcode': postcode
        });
    }

    static async findValidRecipients(recipients = []) {

        let query = {
            is_email_verified: true,
            is_email_subscribed: true
        };
        if (recipients.length) {
            query.email = { $in: recipients };  
        }
    
        const emailArrayObj = await userProfileModule.UserProfile.find(
            query,
            ["email", "username"]
        );
        return emailArrayObj;
      }
    

    static async findByEmail(email, password) {
        let result;
        try {
            result = await userProfileModule.UserProfile.aggregate()
                .match({ email })
                .lookup({
                    from: 'user_types',
                    localField: 'user_type',
                    foreignField: 'user_type',
                    as: 'access_codes'
                })
                .unwind('access_codes')
                .project({
                    uid: 1,
                    email: 1,
                    username: 1,
                    is_email_verified: 1,
                    country_code: 1,
                    phone: 1,
                    avatar: 1,
                    user_type: 1,
                    tokens: 1,
                    password: 1,
                    access_codes: {
                        $concatArrays: [
                            '$access_codes.access_codes',
                            {
                                $ifNull: ['$extra_access_codes', []]
                            }
                        ]
                    }
                });

            result = result[0];

            if (result) {
                if (bcrypt.compareSync(password, result.password)) {
                    return result;
                }
                return null;
            }
            return null;
        } catch (e) {
            throw e;
        }
    }

    static async findByPhone(phone, password) {
        let result;

        phone = phone.replace(/\D/g, '');

        if (phone.length < 8) {
            return null;
        }

        const queryIndicator = phone.substr(phone.length - 8);

        try {
            const regexFactor = '' + queryIndicator + '$';
            result = await userProfileModule.UserProfile.aggregate()
                .match({
                    phone: {
                        $regex: regexFactor
                    }
                })
                .lookup({
                    from: 'user_types',
                    localField: 'user_type',
                    foreignField: 'user_type',
                    as: 'access_codes'
                })
                .unwind('access_codes')
                .project({
                    uid: 1,
                    email: 1,
                    username: 1,
                    is_email_verified: 1,
                    country_code: 1,
                    phone: 1,
                    user_type: 1,
                    avatar: 1,
                    tokens: 1,
                    password: 1,
                    access_codes: {
                        $concatArrays: [
                            '$access_codes.access_codes',
                            {
                                $ifNull: ['$extra_access_codes', []]
                            }
                        ]
                    }
                });

            if (result) {
                for (const user_itt of result) {
                    if (bcrypt.compareSync(password, user_itt.password)) {
                        return user_itt;
                    }
                }

                return null;
            }
            return null;
        } catch (e) {
            throw e;
        }
    }

    static async getUserInfos(userInfo) {
        try {
            let result = await userProfileModule.UserProfile.find({
                _id: { $in: userInfo }
            },['phone','email','country_code']).limit(25);
            
            return result
        } catch (error) {
            throw error;
        }
    }

    static async update(uid, user) {
        try {
            if (user.length < 1) {
                return;
            }

            const objToUpdate = {};

            user.email
                ? (objToUpdate.email = user.email.trim().toLowerCase())
                : null;
            user.rate
                ? (objToUpdate.rate = user.rate)
                : null;
            user.phone ? (objToUpdate.phone = user.phone) : null;
            user.country_code
                ? (objToUpdate.country_code = user.country_code)
                : null;
            user.username ? (objToUpdate.username = user.username) : null;
            // user.referral ? (objToUpdate.referral = user.referral) : null;
            user.ic_number ? (objToUpdate.ic_number = user.ic_number) : null;
            user.gender ? (objToUpdate.gender = user.gender) : null;
            user.avatar ? (objToUpdate.avatar = user.avatar) : null;
            user.user_type ? (objToUpdate.user_type = user.user_type) : null;
            // user.is_client_pic
            //     ? (objToUpdate.is_client_pic = user.is_client_pic)
            //     : null;
            user.password? (objToUpdate.password = user.password): null
            user.reset_password_token
                ? (objToUpdate.reset_password_token = user.reset_password_token)
                : null;
            user.reset_password_token_expire_at
                ? (objToUpdate.reset_password_token_expire_at =
                      user.reset_password_token_expire_at)
                : null;



            if (user.new_password || user.old_password) {
                if (!user.old_password) {
                    throw INPUT_OLD_PASSWORD;
                }
                if (!user.new_password) {
                    throw INPUT_NEW_PASSWORD;
                }
                if (user.new_password !== user.confirm_password) {
                    throw PASSWORD_NO_MATCH;
                }
                if (!user.email && !user.phone) {
                    throw INPUT_EMAIL_OR_PHONE;
                }
                let correctPassword = '';
                if (user.email) {
                    correctPassword = await this.findByEmail(user.email.trim(),user.old_password.trim())
                }else if (user.phone) {
                    correctPassword = await this.findByPhone(user.phone.trim(),user.old_password.trim())
                } 
                
                if (!correctPassword) {
                    throw WRONG_PASSWORD
                }

                if (user.new_password === user.old_password) {
                    throw OLD_PASSWORD_EQUALS_NEW
                }
                
                objToUpdate.password = await this.hashPassword(user.new_password)
            }

            if (user.extra_access_codes) {
                objToUpdate.$addToSet = {
                    extra_access_codes: user.extra_access_codes
                };
            }

            if (user.location) {
                objToUpdate.location = user.location;
            }

            if (objToUpdate.email) {
                objToUpdate.is_email_verified = false;
            }

            const result = await userProfileModule.UserProfile.findOneAndUpdate(
                {
                    uid
                },
                objToUpdate,
                {
                    new: true
                }
            );
            return result;
        } catch (error) {
            throw error;
        }
    }

    static async hashPassword(password) {
        try {
            const salt = bcrypt.genSaltSync(10);
            const hashPass = bcrypt.hashSync(password, salt);
            if (!hashPass) {
                throw new Error('Salt is not generated!');
            }

            return hashPass;
        } catch (e) {
            // @Todo log the error
            throw e;
        }
    }

    static async userExists(email, phone) {
        try {
            phone = phone.replace(/\D/g, '');

            if (phone.length < 8) {
                return true;
            }

            const queryIndicator = phone.substr(phone.length - 8);

            const regexFactor = '' + queryIndicator + '$';

            // check if user already exists
            let userExist = await userProfileModule.UserProfile.find({
                $or: [
                    {
                        email: email
                    },
                    {
                        phone: {
                            $regex: regexFactor
                        }
                    }
                ]
            });

            return userExist.length > 0;
        } catch (e) {
            // @TODO log the error
            console.log(e);
            throw e;
        }
    }

    static async getUserIfExist({ email = '', phone = '' }) {
        try {
            email = email.trim().toLowerCase();

            phone = phone.replace(/\D/g, '');

            const queryIndicator = phone.substr(phone.length - 8);

            const regexFactor = '' + queryIndicator + '$';

            let user;

            if (email) {
                user = await userProfileModule.UserProfile.findOne({ email });
            } else {
                user = await userProfileModule.UserProfile.findOne({
                    phone: {
                        $regex: regexFactor
                    }
                });
            }

            if (!user) {
                return false;
            }

            return user;
        } catch (e) {
            // @TODO log the error
            console.log(e);
            throw e;
        }
    }

    static async create(request, password) {
        try {
            let user = new userProfileModule.UserProfile({
                email: request.email.trim().toLowerCase(),
                phone: request.phone.trim(),
                username: request.username.trim(),
                country_code: request.country_code.trim(),
                password: password,
                user_type: request.user_type,
                client: request.client
            });
            user.last_update = String(Date.now());
            user.uid = user._id.toString();
            user.old_uid = '';
            await user.save();

            //  let makeUserInfo = {
            //      uid: user.uid
            //  };

            //  let userInfo = new userInformationModule.UserInformation(makeUserInfo);
            //  userInfo.save();

            return user;
        } catch (e) {
            throw e;
        }
    }

    static async findById(_id) {
        let result;
        try {
            result = await userProfileModule.UserProfile.findOne({
                _id: _id
            });

            if (result) {
                return result;
            }
            return null;
        } catch (e) {
            throw e;
        }
    }

    // static async authorizeById(_id,password) {
    //     let result;
    //     try {
    //         result = await userProfileModule.UserProfile.findOne({
    //             _id: _id
    //         },'password');

    //         if (result) {
    //             if (bcrypt.compareSync(password, result.password)) {
    //                 return result;
    //             }
    //             return null;
    //         }
    //         return null;
    //     } catch (e) {
    //         throw e;
    //     }
    // }

    static async findByUid(uid) {
        try {
            const result = await userProfileModule.UserProfile.aggregate()
                .match({ uid })
                .lookup({
                    from: 'user_types',
                    localField: 'user_type',
                    foreignField: 'user_type',
                    as: 'access_codes'
                })
                .lookup({
                    from: 'barcodes',
                    localField: 'uid',
                    foreignField: 'uid',
                    as: 'barcodes'
                })
                .unwind('access_codes')
                .project({
                    uid: 1,
                    email: 1,
                    username: 1,
                    country_code: 1,
                    phone: 1,
                    gender: 1,
                    avatar: 1,
                    ic_number: 1,
                    user_type: 1,
                    location: 1,
                    barcodes: '$barcodes.barcode',
                    access_codes: {
                        $concatArrays: [
                            '$access_codes.access_codes',
                            {
                                $ifNull: ['$extra_access_codes', []]
                            }
                        ]
                    }
                });

            return result[0];
        } catch (e) {
            throw e;
        }
    }

    static async removeAccessCode(uid, access_code) {
        try {
            const result = await userProfileModule.UserProfile.updateOne(
                { uid },
                {
                    $pull: {
                        extra_access_codes: access_code
                    }
                }
            );

            return result;
        } catch (error) {
            throw error;
        }
    }


    static async findUIDById(_id) {
        let result;
        try {
            result = await userProfileModule.UserProfile.findOne({
                _id: _id
            });

            if (result) {
                return result.uid;
            }
            return null;
        } catch (e) {
            throw e;
        }
    }

    static async findMembersById(members) {
        try {
            let validMembers = await userProfileModule.UserProfile.find({
                uid: {
                    $in: members
                }
            });

            return validMembers;
        } catch (e) {
            throw e;
        }
    }

    static async getByEmail(email) {
        try {
            const user = await userProfileModule.UserProfile.findOne({
                email
            });
            return user;
        } catch (error) {
            throw error;
        }
    }

    // static async getUserListOfBirds(uid) { 
    //     try {
    //         let query = await userProfileModule.UserProfile.aggregate()
    //         .match({ uid })
    //         .unwind({
    //             path: '$birds',
    //             preserveNullAndEmptyArrays: true
    //           })
    //         .lookup({
    //             from: 'birds',
    //             localField: 'birds.bird_id',
    //             foreignField: 'bird_id',
    //             as: 'birdsArray'
    //         })

    //         .unwind({
    //             path: '$birdsArray',
    //             preserveNullAndEmptyArrays: true
    //           })
    //           .project({
    //             _id: 0,
    //             bird_id: '$birdsArray.bird_id',
    //             bird_name: '$birdsArray.bird_name',
    //             bird_image: '$birdsArray.bird_image',
    //             bird_animated_image: '$birdsArray.bird_animated_image',
    //             description: '$birdsArray.description',
    //             caption: '$birdsArray.caption',
    //             bin_id: '$birds.bin_id',
    //             level_obtained: '$birds.level_obtained',
    //             date_obtained: '$birds.date_obtained'
               
    //         })
    //         .group({
    //             _id: '$bird_id',
    //             count: {
    //                 $sum: 1
    //             }
    //         })

    //         if (query[0]) {
    //             if (!query[0]._id ) {
    //                 return [];
    //             }
    //         }

    //         for (let i = 0; i < query.length; i++) {
    //             let bird = await BirdHelper.getBird(query[i]._id)
    //             query[i].bird_id = bird.bird_id
    //             query[i].bird_name = bird.bird_name
    //             query[i].bird_animated_image = bird.bird_animated_image
    //             query[i].bird_image = bird.bird_image
    //             query[i].caption = bird.caption
    //             query[i].age = bird.age
    //             query[i].description = bird.description
    //             query[i].updated_at = bird.updated_at
    //         }

            
    //         return query;
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    static async getByResetPasswordToken(reset_password_token) {
        try {
            const user = await userProfileModule.UserProfile.findOne({
                reset_password_token,
                reset_password_token_expire_at: {
                    $gt: new Date()
                }
            });
            return user;
        } catch (error) {
            throw error;
        }
    }

    static async getByActivationEmailToken(email_validation_token) {
        try {
            const user = await userProfileModule.UserProfile.findOne({
                email_validation_token
                // reset_password_token_expire_at: {
                //     $gt: new Date()
                // }
            });
            return user;
        } catch (error) {
            throw error;
        }
    }

    static async getUsers(options) {
        try {
            return this.getAllUsers(options);
          
        } catch (error) {
            throw error;
        }
    }

    static async getAllUsers({
        sort,
        order,
        page,
        pageSize,
        filter,
        fromDate,
        toDate
    }) {
        try {
            sort = sort || 'email';
            order = order || 'asc';
            page = page || 1;
            const recordPerPage = parseInt(pageSize) || 10;
            const startIndex = (parseInt(page) - 1) * recordPerPage;
            filter = filter || '';
           
            const query = userProfileModule.UserProfile.aggregate()
                // .lookup({
                //     from: 'barcodes',
                //     localField: 'uid',
                //     foreignField: 'uid',
                //     as: 'barcodes'
                // });

             // filter
            if (fromDate && toDate) {
                query.match({
                    registration_date: {
                        $lte: new Date(toDate),
                        $gte: new Date(fromDate)
                    }
                });
            }
            if (filter) {
                query.match({
                    $or: [
                        {
                            username: {
                                $regex: `${filter}`,
                                $options: 'xi'
                            }
                        },
                        {
                            email: {
                                $regex: filter,
                                $options: 'xi'
                            }
                        },
                        {
                            phone: {
                                $regex: filter,
                                $options: 'xi'
                            }
                        },
                        // {
                        //     'barocodes.barcode': {
                        //         $regex: filter,
                        //         $options: 'xi'
                        //     }
                        // },
                        {
                            uid: {
                                $regex: filter,
                                $options: 'xi'
                            }
                        }
                    ]
                });
            }

            query.project({
                email: 1,
                phone: 1,
                location: 1,
                registration_date: 1,
                // barcodes: 1,
                username: 1,
                uid: 1,
            });

            // sort
            query
                .sort({
                    [sort]: order
                })

                .group({
                    _id: null,
                    total_count: {
                        $sum: 1
                    },
                    data: {
                        $push: '$$ROOT'
                    }
                })

                .project({
                    _id: false,
                    total_count: true,
                    data: {
                        $slice: ['$data', startIndex, recordPerPage]
                    }
                });

            const uesrs = await query;
            return uesrs[0] || [];
        } catch (error) {
            throw error;
        }
    }


    // static async getLedearboard({
    //     sort,
    //     order,
    //     page,
    //     pageSize,
    //     filter,
    //     uid
    // }) {
    //     try {
    //         sort = sort || 'birds';
    //         order = order || 'desc';
    //         page = page || 1;
    //         const recordPerPage = parseInt(pageSize) || 10;
    //         const startIndex = (parseInt(page) - 1) * recordPerPage;
           
    //         const query = userProfileModule.UserProfile.aggregate()
                
            
    //         query.project({
    //             _id:0,
    //             uid:1,
    //             "birds": { $cond: { if: { $isArray: "$birds" }, then: { $size: "$birds" }, else: 0} },
    //             "username": { "$toLower": "$username" },
    //             avatar: 1
    //         })
          
    //         // sort
    //         query
    //             .sort({
    //                 [sort]: order
    //             })

    //             .group({
    //                 _id: null,
    //                 total_count: {
    //                     $sum: 1
    //                 },
    //                 data: {
    //                     $push: '$$ROOT'
    //                 }
    //             })

    //             .project({
    //                 _id: false,
    //                 total_count: true,
    //                 data: {
    //                     $slice: ['$data', startIndex, recordPerPage]
    //                 }
    //             });

    //         const result = await query;

    //         if (!result[0]) {
    //             return [];
    //         }
    //         if (!result[0].data[0]) {
    //             return [];
    //         }

    //         result[0].data.sort(function (user1, user2) {
    //             if (user1.birds > user2.birds) return -1;
    //             if (user1.birds < user2.birds) return 1;
    //             if (user1.username > user2.username) return 1;
    //             if (user1.username < user2.username) return -1;
    //         });


    //         const presentUser = await this.findByUid(uid)
    //         let indexPos = result[0].data.findIndex(obj => obj.uid === presentUser.uid)+1;
    //         if (indexPos <= 0) {
    //             return {total_count : result[0].total_count, position: 'You do not have any birds yet', data: result[0].data};
    //         }
    //         const position = await this.getOrdinal(indexPos)

    //         return {total_count : result[0].total_count, position: `${indexPos}${position}`, data: result[0].data};
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    // static async getOrdinal(n){return["st","nd","rd"][((n+90)%100-10)%10-1]||"th"}

    // static async getUsersByBins({
    //     uid,
    //     sort,
    //     order,
    //     page,
    //     pageSize,
    //     filter,
    //     fromDate,
    //     toDate
    // }) {
    //     try {
    //         sort = sort || 'email';
    //         order = order || 'asc';
    //         page = page || 1;
    //         const recordPerPage = parseInt(pageSize) || 10;
    //         const startIndex = (parseInt(page) - 1) * recordPerPage;
    //         filter = filter || '';
    //         let clientIds = [];
            
    //         const clients = await ClientModel.find({ pic: uid }, 'client_id');
    //         clientIds = clients.map(client => client.client_id);

    //         const query = BinInformation.aggregate().match({
    //             $or: [
    //                 { client_id: { $in: clientIds } },
    //                 { 'owner.uid': uid }
    //             ]
    //         })
    //         .lookup({
    //             from: 'groups',
    //             localField: 'gid',
    //             foreignField: 'gid',
    //             as: 'group'
    //         })
    //         .unwind('group')
    //         .replaceRoot('group')
    //         .lookup({
    //             from: 'user_information',
    //             localField: 'members',
    //             foreignField: 'uid',
    //             as: 'user'
    //         })
    //         .unwind('user')
    //         .replaceRoot('user')
    //         .lookup({
    //             from: 'barcodes',
    //             localField: 'uid',
    //             foreignField: 'uid',
    //             as: 'barcodes'
    //         })
    //         // filter
    //         if (fromDate && toDate) {
    //             query.match({
    //                 joining_date: {
    //                     $lte: new Date(toDate),
    //                     $gte: new Date(fromDate)
    //                 }
    //             });
    //         }
    //         if (filter) {
    //             query.match({
    //                 $or: [
    //                     {
    //                         username: {
    //                             $regex: `${filter}`,
    //                             $options: 'xi'
    //                         }
    //                     },
    //                     {
    //                         email: {
    //                             $regex: filter,
    //                             $options: 'xi'
    //                         }
    //                     },
    //                     {
    //                         phone: {
    //                             $regex: filter,
    //                             $options: 'xi'
    //                         }
    //                     },
    //                     {
    //                         uid: {
    //                             $regex: filter,
    //                             $options: 'xi'
    //                         }
    //                     }
    //                 ]
    //             });
    //         }

    //         query.project({
    //             email: 1,
    //             phone: 1,
    //             location: 1,
    //             joining_date: 1,
    //             barcodes: 1,
    //             username: 1,
    //             uid: 1,
    //         });

    //         // sort
    //         query
    //             .sort({
    //                 [sort]: order
    //             })

    //             .group({
    //                 _id: null,
    //                 total_count: {
    //                     $sum: 1
    //                 },
    //                 data: {
    //                     $push: '$$ROOT'
    //                 }
    //             })

    //             .project({
    //                 total_count: true,
    //                 data: {
    //                     $slice: ['$data', startIndex, recordPerPage]
    //                 }
    //             });

    //         const uesrs = await query;
    //         return uesrs[0] || [];
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    // static async getAllUsersFilter(query) {
    //     try {
    //         let result = await userProfileModule.UserProfile.find({
    //             $or: [
    //                 {
    //                     username: {
    //                         $regex: query
    //                     }
    //                 },
    //                 {
    //                     uid: {
    //                         $regex: query
    //                     }
    //                 }
    //             ]
    //         }).limit(50);

    //         return result;
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    // static async getAllCollectors({
    //     sort,
    //     order,
    //     filter,
    //     page,
    //     recordPerPage
    // }) {
    //     try {
    //         sort = sort || 'priority';
    //         order = order || 'desc';
    //         filter = filter || '';
    //         page = page || 1;
    //         recordPerPage = parseInt(recordPerPage) || 10;
    //         const startIndex = (page - 1) * recordPerPage;


    //         const query = userProfileModule.UserProfile.aggregate().match({
    //             user_type: 2
    //         });

    //         if (filter) {
    //             query.match({
    //                 $or: [{
    //                     username: {
    //                         $regex: `${filter}`,
    //                         $options: 'xi'
    //                     }
    //                 },
    //                 {
    //                     email: {
    //                         $regex: filter,
    //                         $options: 'xi'
    //                     }
    //                 }
    //                 ]
    //             });
    //         }

    //         query.project({
    //             _id: 0,
    //             email: 1})

    //         // sort
    //         query
    //             .sort({
    //                 [sort]: order
    //             })

    //             .group({
    //                 _id: null,
    //                 total_count: {
    //                     $sum: 1
    //                 },
    //                 data: {
    //                     $push: '$$ROOT'
    //                 }
    //             })

    //             .project({
    //                 total_count: true,
    //                 collectors: {
    //                     $slice: ['$data', startIndex, recordPerPage]
    //                 }
    //             });

    //         let result = await query;

    //         if (!result[0]) {
    //             return [];
    //         }
    //         if (!result[0].collectors[0]) { 
    //             return [];
    //         }
    //         return result[0].collectors
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    // static async getCollectorsMetadata(filter) {
    //     const query = userProfileModule.UserProfile.aggregate().match({
    //         user_type: 2
    //     });

    //     if (filter) {
    //         query.match({ username: filter });
    //     }

    //     query.project({
    //         username: 1,
    //         uid: 1,
    //         _id: 0
    //     });

    //     return query;
    // }

    // static async getAllBarcodes(query) {
    //     try {
    //         let result = await userProfileModule.UserProfile.find({
    //             uid: query
    //         });

    //         return result;
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    // static async getUserAccessCodes(uid) {
    //     try {
    //         const result = await userProfileModule.UserProfile.aggregate()
    //             .match({ uid })
    //             .lookup({
    //                 from: 'user_types',
    //                 localField: 'user_type',
    //                 foreignField: 'user_type',
    //                 as: 'user_type'
    //             })
    //             .unwind('user_type')
    //             .project({
    //                 _id: 0,
    //                 access_codes: {
    //                     $concatArrays: [
    //                         '$user_type.access_codes',
    //                         {
    //                             $ifNull: ['$extra_access_codes', []]
    //                         }
    //                     ]
    //                 }
    //             })
    //             .lookup({
    //                 from: 'access_codes',
    //                 localField: 'access_codes',
    //                 foreignField: 'code',
    //                 as: 'access_codes'
    //             });

    //         return result[0].access_codes;
    //     } catch (error) {
    //         throw error;
    //     }
    // }

    static async getUserType(uid) {
        try {
            const user = await userProfileModule.UserProfile.findOne({
                uid
            });
            return user.user_type;
        } catch (error) {
            throw error;
        }
    }

  
    static async getAllPhones() {
        try {
            const query = await userProfileModule.UserProfile.aggregate().group(
                {
                    _id: null,
                    phones: { $push: '$phone' }
                }
            );
            return query[0].phones;
        } catch (error) {
            throw error;
        }
    }

    static async getUserByToken(token) {
        const user = await userProfileModule.UserProfile.aggregate()
            .match({ 'tokens.token': token })
            .lookup({
                from: 'user_types',
                localField: 'user_type',
                foreignField: 'user_type',
                as: 'access_codes'
            })
            .unwind('access_codes')
            .project({
                uid: 1,
                email: 1,
                username: 1,
                country_code: 1,
                phone: 1,
                user_type: 1,
                tokens: 1,
                password: 1,
                access_codes: {
                    $concatArrays: [
                        '$access_codes.access_codes',
                        {
                            $ifNull: ['$extra_access_codes', []]
                        }
                    ]
                }
            });

        return user[0];
    }

    /**
     *
     * @param {Array<String>} uids
     */
    static async filterUidsIfExist(uids = []) {
        try {
            const existUids = [];

            for (const uid of uids) {
                if (await User.findByUid(uid)) {
                    existUids.push(uid);
                }
            }

            return existUids;
        } catch (error) {
            throw error;
        }
    }

    static async updateUserByEmail(email, toSet) {
        // todo: add if email exist
        return userProfileModule.UserProfile.updateOne(
            {
                email: email
            },
            {
                $set: toSet
            }
        );
    }

    static async updateUserByActivationEmailToken(
        email_validation_token,
        is_email_verified
    ) {
        return userProfileModule.UserProfile.updateOne(
            { email_validation_token: email_validation_token },
            {
                $set: is_email_verified
            }
        );
    }

    static async findUserByEmailToken(email_token) {
        const user = await userProfileModule.UserProfile.find({
            email_validation_token: email_token
        });

        return user;
    }
}

module.exports = User;
