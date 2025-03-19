// login
// register
exports.login = (req, res) => {};

exports.register = (req, res) => {
  try {
    const { username, email, password } = req.body;

    if(!username){
        
    }

    if(!email){

    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};
